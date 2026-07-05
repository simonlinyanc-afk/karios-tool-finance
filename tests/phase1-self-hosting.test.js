import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import { createAppServer } from '../server.js';

function dispatchOcrRequest(server, body) {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = 'POST';
  req.url = '/api/ocr';
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
          payload: JSON.parse(String(payload))
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
      return [value.message, value.stack || '', value.code || '', value.statusCode || '', cause].join('\n');
    }
    return typeof value === 'string' ? value : JSON.stringify(value);
  }).join('\n');
}

function createNeedsReviewEnvelope() {
  return {
    status: 'needs_review',
    data: {
      date: '',
      invoiceNumber: 'INV-REVIEW',
      amount: 106,
      tax: 6,
      subtotal: 100,
      totalWithTax: 106
    },
    warnings: [{ code: 'missing_date', field: 'date', message: '发票日期缺失' }],
    meta: { model: 'review-test-model', fallbackUsed: true, latencyMs: 25 }
  };
}

test('self-hosted OCR passes high_accuracy mode to the shared service', async () => {
  const calls = [];
  const server = createAppServer({
    ocrService: async (request) => {
      calls.push(request);
      return { ok: true };
    }
  });

  const response = await dispatchOcrRequest(server, {
    image: 'data:image/png;base64,Zm9v',
    mode: 'high_accuracy'
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.payload, { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].mode, 'high_accuracy');
  assert.ok(calls[0].request);
});

test('self-hosted OCR defaults missing mode to normal', async () => {
  const calls = [];
  const server = createAppServer({
    ocrService: async (request) => {
      calls.push(request);
      return { ok: true };
    }
  });

  const response = await dispatchOcrRequest(server, {
    image: 'data:image/png;base64,Zm9v'
  });

  assert.equal(response.statusCode, 200);
  assert.equal(calls[0].mode, 'normal');
});

test('self-hosted OCR dispatch passes the formal service envelope through unchanged', async () => {
  const envelope = createNeedsReviewEnvelope();
  const server = createAppServer({
    ocrService: async () => envelope
  });

  const response = await dispatchOcrRequest(server, {
    image: 'data:image/png;base64,Zm9v'
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.payload, envelope);
});

test('self-hosted OCR returns safe stable service errors without sensitive logs', async () => {
  const secretImage = 'data:image/png;base64,U0VDUkVUX0lNQUdF';
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
    const server = createAppServer({
      ocrService: async () => {
        throw failure;
      },
      logger: { log: (entry) => logged.push([entry]) }
    });
    const response = await dispatchOcrRequest(server, { image: secretImage });

    const serializedLog = serializeLogEntries(logged);
    const serializedResponse = JSON.stringify(response.payload);
    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.payload, {
      error: '识别服务暂时不可用。',
      code: errorCase.expectedCode,
      action: '请稍后重新识别；如果仍然失败，请联系管理员。'
    });
    assert.doesNotMatch(serializedResponse, /SECRET_IMAGE|base64|sk-secret-api-key/);
    assert.match(serializedLog, new RegExp(errorCase.expectedCode));
    assert.doesNotMatch(serializedLog, /SECRET_IMAGE|base64|sk-secret-api-key/);
  }
});

test('self-hosted OCR returns 400 when image is missing', async () => {
  const server = createAppServer({
    ocrService: async () => ({ ok: true })
  });

  const response = await dispatchOcrRequest(server, {});

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.payload, {
    error: '图片内容无法读取。',
    code: 'INVALID_IMAGE_DATA',
    action: '请重新选择 JPG 或 PNG 图片后再试。'
  });
});
