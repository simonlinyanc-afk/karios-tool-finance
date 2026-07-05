import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Readable } from 'node:stream';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { config, createOcrHandler } from '../api/ocr.js';
import { createOcrLogger } from '../api/logger.js';
import { MAX_REQUEST_BODY_BYTES } from '../api/security.js';
import { createAppServer, startServer } from '../server.js';

const TOKEN = 'phase3-integration-secret-32-characters-long';
const VALID_IMAGE = 'data:image/png;base64,Zm9v';

function createResponseRecorder(resolve) {
  return {
    statusCode: 200,
    headers: {},
    payload: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      if (resolve) resolve({ statusCode: this.statusCode, payload, headers: this.headers });
      return this;
    },
    writeHead(code, headers = {}) {
      this.statusCode = code;
      this.headers = headers;
    },
    end(payload = '') {
      const parsed = payload ? JSON.parse(String(payload)) : undefined;
      this.payload = parsed;
      if (resolve) resolve({ statusCode: this.statusCode, payload: parsed, headers: this.headers });
    }
  };
}

function dispatchServer(server, {
  body = { image: VALID_IMAGE },
  headers = {},
  headersDistinct,
  stream,
  method = 'POST'
} = {}) {
  const req = stream || Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = method;
  req.url = '/api/ocr';
  req.headers = {
    'content-type': 'application/json',
    ...headers
  };
  if (headersDistinct) req.headersDistinct = headersDistinct;
  return new Promise((resolve, reject) => {
    req.once('error', reject);
    server.emit('request', req, createResponseRecorder(resolve));
  });
}

function dispatchVercel(handler, {
  body = { image: VALID_IMAGE },
  headers = {},
  method = 'POST'
} = {}) {
  return new Promise((resolve) => {
    handler({
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body
    }, createResponseRecorder(resolve));
  });
}

test('self-hosted production denies unauthenticated requests before reading the body', async () => {
  let reads = 0;
  const stream = new Readable({
    read() {
      reads += 1;
      this.push(Buffer.from(JSON.stringify({ image: VALID_IMAGE })));
      this.push(null);
    }
  });
  const server = createAppServer({
    env: { NODE_ENV: 'production', OCR_ACCESS_TOKEN: TOKEN },
    ocrService: async () => assert.fail('service must not run')
  });

  const response = await dispatchServer(server, { stream });

  assert.equal(response.statusCode, 403);
  assert.equal(response.payload.code, 'OCR_ACCESS_DENIED');
  assert.equal(reads, 0);
  assert.doesNotMatch(JSON.stringify(response.payload), /Bearer|Token|JSON|OCR_ACCESS_TOKEN/u);
});

test('self-hosted production accepts an injected credential and logs only safe metadata', async () => {
  const lines = [];
  const calls = [];
  const server = createAppServer({
    env: { NODE_ENV: 'production', OCR_ACCESS_TOKEN: TOKEN },
    logger: createOcrLogger({ write: (line) => lines.push(line) }),
    requestIdFactory: () => 'request-safe',
    ocrService: async (input) => {
      calls.push(input);
      return {
        status: 'ready',
        data: {},
        warnings: [],
        meta: { model: 'qwen-test', latencyMs: 12, fallbackUsed: false }
      };
    }
  });

  const response = await dispatchServer(server, {
    headers: {
      authorization: `Bearer ${TOKEN}`,
      'x-ocr-token-source': 'nginx'
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].image, VALID_IMAGE);
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), {
    requestId: 'request-safe',
    model: 'qwen-test',
    latencyMs: 12,
    status: 'ready',
    tokenSource: 'nginx',
    authResult: 'allowed'
  });
  assert.doesNotMatch(lines[0], /phase3-integration-secret|base64|Zm9v/u);
});

test('self-hosted checks media type and declared size before reading', async () => {
  const server = createAppServer({ ocrService: async () => assert.fail('service must not run') });
  const wrongType = await dispatchServer(server, {
    headers: { 'content-type': 'text/plain' }
  });
  assert.equal(wrongType.statusCode, 415);
  assert.equal(wrongType.payload.code, 'UNSUPPORTED_MEDIA_TYPE');

  const oversized = await dispatchServer(server, {
    headers: { 'content-length': String(MAX_REQUEST_BODY_BYTES + 1) }
  });
  assert.equal(oversized.statusCode, 413);
  assert.equal(oversized.payload.code, 'REQUEST_TOO_LARGE');
});

test('self-hosted rejects duplicate security headers reported by Node', async () => {
  const productionServer = createAppServer({
    env: { NODE_ENV: 'production', OCR_ACCESS_TOKEN: TOKEN },
    ocrService: async () => assert.fail('service must not run')
  });
  const duplicateAuthorization = await dispatchServer(productionServer, {
    headers: { authorization: `Bearer ${TOKEN}` },
    headersDistinct: {
      authorization: [`Bearer ${TOKEN}`, 'Bearer other'],
      'content-type': ['application/json']
    }
  });
  assert.equal(duplicateAuthorization.statusCode, 403);
  assert.equal(duplicateAuthorization.payload.code, 'OCR_ACCESS_DENIED');

  const developmentServer = createAppServer({
    ocrService: async () => assert.fail('service must not run')
  });
  const duplicateContentType = await dispatchServer(developmentServer, {
    headersDistinct: {
      'content-type': ['application/json', 'text/plain']
    }
  });
  assert.equal(duplicateContentType.statusCode, 415);
  assert.equal(duplicateContentType.payload.code, 'UNSUPPORTED_MEDIA_TYPE');
});

test('self-hosted stream limit rejects bodies over 15 MiB without a length header', async () => {
  const stream = Readable.from([
    Buffer.alloc(MAX_REQUEST_BODY_BYTES, 0x20),
    Buffer.from('x')
  ]);
  const server = createAppServer({ ocrService: async () => assert.fail('service must not run') });
  const response = await dispatchServer(server, { stream });
  assert.equal(response.statusCode, 413);
  assert.equal(response.payload.code, 'REQUEST_TOO_LARGE');
});

test('self-hosted streaming overflow drains without destroying the request stream', async () => {
  let ended = false;
  const stream = new Readable({
    autoDestroy: false,
    read() {
      this.push(Buffer.alloc(48, 0x20));
      this.push(Buffer.alloc(48, 0x20));
      this.push(null);
    }
  });
  stream.once('end', () => { ended = true; });
  const server = createAppServer({
    maxRequestBytes: 64,
    ocrService: async () => assert.fail('service must not run')
  });

  const response = await dispatchServer(server, { stream });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(response.statusCode, 413);
  assert.equal(response.payload.code, 'REQUEST_TOO_LARGE');
  assert.equal(ended, true);
  assert.equal(stream.destroyed, false);
});

test('real chunked HTTP overflow returns stable 413 JSON instead of resetting the client', async () => {
  const server = createAppServer({
    maxRequestBytes: 64,
    logger: { log() {} },
    ocrService: async () => assert.fail('service must not run')
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();

  try {
    const response = await new Promise((resolve, reject) => {
      const request = http.request({
        host: '127.0.0.1',
        port: address.port,
        path: '/api/ocr',
        method: 'POST',
        headers: { 'content-type': 'application/json' }
      }, (incoming) => {
        const chunks = [];
        incoming.on('data', (chunk) => chunks.push(chunk));
        incoming.on('end', () => resolve({
          statusCode: incoming.statusCode,
          payload: JSON.parse(Buffer.concat(chunks).toString('utf8'))
        }));
      });
      request.once('error', reject);
      request.write(Buffer.alloc(48, 0x20));
      request.write(Buffer.alloc(48, 0x20));
      request.end();
    });

    assert.equal(response.statusCode, 413);
    assert.deepEqual(response.payload, {
      error: '图片数据超过大小限制。',
      code: 'REQUEST_TOO_LARGE',
      action: '请压缩图片或拆分文件后重新上传。'
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('both entry points reject non-image and unsupported image data consistently', async () => {
  const server = createAppServer({ ocrService: async () => assert.fail('service must not run') });
  const handler = createOcrHandler({ ocrService: async () => assert.fail('service must not run') });

  for (const image of [undefined, 'data:image/webp;base64,Zm9v', 'data:image/png;base64,']) {
    const serverResponse = await dispatchServer(server, { body: { image } });
    const vercelResponse = await dispatchVercel(handler, { body: { image } });
    assert.equal(serverResponse.statusCode, 400);
    assert.equal(vercelResponse.statusCode, 400);
    assert.deepEqual(serverResponse.payload, vercelResponse.payload);
    assert.equal(serverResponse.payload.code, 'INVALID_IMAGE_DATA');
  }
});

test('Vercel handler enforces production auth and parsed body size', async () => {
  assert.deepEqual(config, { api: { bodyParser: { sizeLimit: '15mb' } } });
  const handler = createOcrHandler({
    env: { NODE_ENV: 'production', OCR_ACCESS_TOKEN: TOKEN },
    ocrService: async () => ({ ok: true })
  });

  const denied = await dispatchVercel(handler);
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.payload.code, 'OCR_ACCESS_DENIED');

  const oversized = await dispatchVercel(handler, {
    headers: {
      authorization: `Bearer ${TOKEN}`,
      'x-ocr-token-source': 'session'
    },
    body: { image: 'x'.repeat(MAX_REQUEST_BODY_BYTES) }
  });
  assert.equal(oversized.statusCode, 413);
  assert.equal(oversized.payload.code, 'REQUEST_TOO_LARGE');
});

test('Vercel production without server configuration refuses safely', async () => {
  const handler = createOcrHandler({
    env: { NODE_ENV: 'production' },
    ocrService: async () => assert.fail('service must not run')
  });
  const response = await dispatchVercel(handler);
  const serialized = JSON.stringify(response.payload);
  assert.equal(response.statusCode, 503);
  assert.equal(response.payload.code, 'SECURITY_NOT_CONFIGURED');
  assert.doesNotMatch(serialized, /OCR_ACCESS_TOKEN|Bearer|Token|环境变量/u);
});

test('Vercel normalized production rejects placeholder and weak server credentials safely', async () => {
  for (const env of [
    { NODE_ENV: 'production ', OCR_ACCESS_TOKEN: 'too-short' },
    {
      NODE_ENV: 'PRODUCTION',
      OCR_ACCESS_TOKEN: 'replace-with-a-long-random-internal-value'
    }
  ]) {
    const handler = createOcrHandler({
      env,
      ocrService: async () => assert.fail('service must not run')
    });
    const response = await dispatchVercel(handler);
    const serialized = JSON.stringify(response.payload);
    assert.equal(response.statusCode, 503);
    assert.equal(response.payload.code, 'SECURITY_NOT_CONFIGURED');
    assert.doesNotMatch(serialized, /OCR_ACCESS_TOKEN|replace-with|too-short|Bearer|Token/u);
  }
});

test('self-hosted normalized production refuses startup for missing placeholder or weak credentials', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kairos-security-'));
  const previousNodeEnv = process.env.NODE_ENV;
  const previousToken = process.env.OCR_ACCESS_TOKEN;
  try {
    for (const config of [
      { NODE_ENV: 'production' },
      { NODE_ENV: 'production ', OCR_ACCESS_TOKEN: 'too-short' },
      {
        NODE_ENV: 'PRODUCTION',
        OCR_ACCESS_TOKEN: 'replace-with-a-long-random-internal-value'
      }
    ]) {
      process.env.NODE_ENV = config.NODE_ENV;
      if (config.OCR_ACCESS_TOKEN === undefined) delete process.env.OCR_ACCESS_TOKEN;
      else process.env.OCR_ACCESS_TOKEN = config.OCR_ACCESS_TOKEN;
      await assert.rejects(
        startServer({ rootDir, host: '127.0.0.1', port: 0 }),
        (error) => error.code === 'SECURITY_NOT_CONFIGURED'
      );
    }
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousToken === undefined) delete process.env.OCR_ACCESS_TOKEN;
    else process.env.OCR_ACCESS_TOKEN = previousToken;
    await fs.rm(rootDir, { recursive: true, force: true });
  }
});

test('a logger write failure cannot replace a successful OCR response', async () => {
  const throwingLogger = { log: () => { throw new Error('sink unavailable'); } };
  const service = async () => ({ status: 'ready', data: {}, warnings: [], meta: {} });
  const server = createAppServer({ logger: throwingLogger, ocrService: service });
  const handler = createOcrHandler({ logger: throwingLogger, ocrService: service });

  const [serverResponse, vercelResponse] = await Promise.all([
    dispatchServer(server),
    dispatchVercel(handler)
  ]);

  assert.equal(serverResponse.statusCode, 200);
  assert.equal(vercelResponse.statusCode, 200);
  assert.equal(serverResponse.payload.status, 'ready');
  assert.equal(vercelResponse.payload.status, 'ready');
});

test('both entry points reject OPTIONS with the same actionable payload and log shape', async () => {
  const serverLogs = [];
  const vercelLogs = [];
  const service = async () => assert.fail('service must not run');
  const server = createAppServer({
    logger: { log: (fields) => serverLogs.push(fields) },
    requestIdFactory: () => 'server-options',
    ocrService: service
  });
  const handler = createOcrHandler({
    logger: { log: (fields) => vercelLogs.push(fields) },
    requestIdFactory: () => 'vercel-options',
    ocrService: service
  });

  const [serverResponse, vercelResponse] = await Promise.all([
    dispatchServer(server, { method: 'OPTIONS' }),
    dispatchVercel(handler, { method: 'OPTIONS' })
  ]);
  const expectedPayload = {
    error: '不支持此请求方式。',
    code: 'METHOD_NOT_ALLOWED',
    action: '请刷新页面后重新识别。'
  };

  assert.equal(serverResponse.statusCode, 405);
  assert.equal(vercelResponse.statusCode, 405);
  assert.deepEqual(serverResponse.payload, expectedPayload);
  assert.deepEqual(vercelResponse.payload, expectedPayload);
  assert.deepEqual(serverLogs, [{
    requestId: 'server-options',
    status: 405,
    errorType: 'METHOD_NOT_ALLOWED',
    tokenSource: 'direct',
    authResult: 'denied'
  }]);
  assert.deepEqual(vercelLogs, [{
    requestId: 'vercel-options',
    status: 405,
    errorType: 'METHOD_NOT_ALLOWED',
    tokenSource: 'direct',
    authResult: 'denied'
  }]);
});
