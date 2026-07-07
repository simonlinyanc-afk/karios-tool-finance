import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { createAppServer, getStartupDisplayOrigin } from '../server.js';
import { extractJsonObject } from '../api/ocr-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

function dispatchWithoutListening(server, {
  method = 'POST',
  url = '/api/ocr',
  body = {}
} = {}) {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = method;
  req.url = url;
  req.headers = { 'content-type': 'application/json' };

  return new Promise((resolve, reject) => {
    const response = {
      statusCode: 200,
      headers: {},
      writeHead(statusCode, headers = {}) {
        this.statusCode = statusCode;
        this.headers = headers;
      },
      end(payload = '') {
        resolve({
          statusCode: this.statusCode,
          headers: this.headers,
          body: String(payload)
        });
      }
    };

    req.once('error', reject);
    server.emit('request', req, response);
  });
}

function serializeLogEntries(entries) {
  return entries.flatMap(entry => entry).map((value) => {
    if (value instanceof Error) {
      const cause = value.cause instanceof Error
        ? `${value.cause.message}\n${value.cause.stack || ''}`
        : String(value.cause || '');
      return [
        value.name,
        value.message,
        value.stack || '',
        value.code || '',
        value.statusCode || '',
        cause
      ].join('\n');
    }
    return typeof value === 'string' ? value : JSON.stringify(value);
  }).join('\n');
}

test('extractJsonObject parses JSON embedded in model output', () => {
  const payload = {
    output: {
      choices: [
        {
          message: {
            content: [
              {
                text: '这里是识别结果\n```json\n{"amount": 128.5, "description": "餐饮美食 - 员工聚餐"}\n```'
              }
            ]
          }
        }
      ]
    }
  };

  const parsed = extractJsonObject(payload);

  assert.equal(parsed.amount, 128.5);
  assert.equal(parsed.description, '餐饮美食 - 员工聚餐');
});

test('createAppServer serves index.html on root path', async (t) => {
  const server = createAppServer({
    rootDir: projectRoot,
    ocrService: async () => ({ ok: true })
  });

  t.after(() => server.close());

  const baseUrl = await listen(server);
  const response = await fetch(`${baseUrl}/`);

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /text\/html/);

  const html = await response.text();
  assert.match(html, /Kairos Finance·黄鸟报销单系统/);
});

test('createAppServer routes POST /api/ocr with high_accuracy mode to OCR service', async (t) => {
  const calls = [];
  const server = createAppServer({
    rootDir: projectRoot,
    ocrService: async (request) => {
      calls.push(request);
      return {
        echoedImageLength: request.image.length,
        category: '其他'
      };
    }
  });

  t.after(() => server.close());

  const baseUrl = await listen(server);
  const response = await fetch(`${baseUrl}/api/ocr`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      image: 'data:image/png;base64,Zm9v',
      mode: 'high_accuracy'
    })
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.deepEqual(await response.json(), {
    echoedImageLength: 'data:image/png;base64,Zm9v'.length,
    category: '其他'
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].mode, 'high_accuracy');
  assert.ok(calls[0].request);
});

test('createAppServer defaults missing OCR mode to normal', async (t) => {
  const calls = [];
  const server = createAppServer({
    rootDir: projectRoot,
    ocrService: async (request) => {
      calls.push(request);
      return { ok: true };
    }
  });

  t.after(() => server.close());

  const baseUrl = await listen(server);
  const response = await fetch(`${baseUrl}/api/ocr`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({ image: 'data:image/png;base64,Zm9v' })
  });

  assert.equal(response.status, 200);
  assert.equal(calls[0].mode, 'normal');
});

test('createAppServer returns 400 when OCR request body misses image', async (t) => {
  const server = createAppServer({
    rootDir: projectRoot,
    ocrService: async () => ({ ok: true })
  });

  t.after(() => server.close());

  const baseUrl = await listen(server);
  const response = await fetch(`${baseUrl}/api/ocr`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({})
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: '图片内容无法读取。',
    code: 'INVALID_IMAGE_DATA',
    action: '请重新选择 JPG 或 PNG 图片后再试。'
  });
});

test('createAppServer maps service errors to safe stable responses without listening', async () => {
  const secretImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const secretImageMarker = 'AScY42YAAAAASUVORK5CYII';
  const secretImage = `data:image/png;base64,${secretImageBase64}`;
  const secretKey = 'sk-secret-api-key';
  const cases = [
    { statusCode: 401, code: 'UPSTREAM_AUTH_ERROR', expectedCode: 'UPSTREAM_AUTH_ERROR' },
    { statusCode: 429, code: 'UPSTREAM_RATE_LIMITED', expectedCode: 'UPSTREAM_RATE_LIMITED' },
    { statusCode: 500, code: `UNSAFE_${secretKey}`, expectedCode: 'OCR_ERROR' }
  ];

  for (const errorCase of cases) {
    const failure = new Error(`upstream rejected ${secretImage} ${secretKey}`, {
      cause: new Error(`cause contains ${secretImage} ${secretKey}`)
    });
    failure.code = errorCase.code;
    failure.statusCode = errorCase.statusCode;

    const logged = [];
    let serviceCalls = 0;
    const server = createAppServer({
      rootDir: projectRoot,
      ocrService: async () => {
        serviceCalls += 1;
        throw failure;
      },
      logger: {
        log(fields) {
          logged.push(fields);
        }
      },
      requestIdFactory: () => 'test-request-id'
    });
    const response = await dispatchWithoutListening(server, {
      body: { image: secretImage }
    });

    const payload = JSON.parse(response.body);
    const serializedLog = serializeLogEntries(logged);
    const serializedResponse = JSON.stringify(payload);
    assert.equal(response.statusCode, 500);
    assert.deepEqual(payload, {
      error: '识别服务暂时不可用。',
      code: errorCase.expectedCode,
      action: '请稍后重新识别；如果仍然失败，请联系管理员。'
    });
    assert.equal(serviceCalls, 1);
    assert.deepEqual(logged, [{
      requestId: 'test-request-id',
      status: 500,
      errorType: errorCase.expectedCode,
      tokenSource: 'direct',
      authResult: 'development_bypass'
    }]);
    const secretPattern = new RegExp(`${secretImageMarker}|base64|${secretKey}`);
    assert.doesNotMatch(serializedResponse, secretPattern);
    assert.doesNotMatch(serializedLog, secretPattern);
  }
});

test('getStartupDisplayOrigin prefers localhost-friendly address for wildcard hosts', () => {
  assert.equal(
    getStartupDisplayOrigin({ host: '0.0.0.0', port: 3000 }),
    'http://127.0.0.1:3000'
  );
  assert.equal(
    getStartupDisplayOrigin({ host: '::', port: 3000 }),
    'http://127.0.0.1:3000'
  );
  assert.equal(
    getStartupDisplayOrigin({ host: '127.0.0.1', port: 3000 }),
    'http://127.0.0.1:3000'
  );
});
