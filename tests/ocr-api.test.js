import test from 'node:test';
import assert from 'node:assert/strict';

import { createOcrHandler } from '../api/ocr.js';

function createResponseRecorder() {
  return {
    statusCode: 200,
    payload: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
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

test('Vercel OCR handler passes high_accuracy mode to the shared service', async () => {
  const calls = [];
  const handler = createOcrHandler({
    ocrService: async (request) => {
      calls.push(request);
      return { ok: true };
    }
  });
  const req = {
    method: 'POST',
    body: {
      image: 'data:image/png;base64,Zm9v',
      mode: 'high_accuracy'
    }
  };
  const res = createResponseRecorder();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload, { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].image, 'data:image/png;base64,Zm9v');
  assert.equal(calls[0].mode, 'high_accuracy');
  assert.equal(calls[0].request, req);
});

test('Vercel OCR handler defaults missing mode to normal', async () => {
  const calls = [];
  const handler = createOcrHandler({
    ocrService: async (request) => {
      calls.push(request);
      return { ok: true };
    }
  });
  const req = {
    method: 'POST',
    body: { image: 'data:image/png;base64,Zm9v' }
  };

  await handler(req, createResponseRecorder());

  assert.equal(calls[0].mode, 'normal');
});

test('Vercel OCR handler passes the formal service envelope through unchanged', async () => {
  const envelope = createNeedsReviewEnvelope();
  const handler = createOcrHandler({
    ocrService: async () => envelope
  });
  const response = createResponseRecorder();

  await handler({
    method: 'POST',
    body: { image: 'data:image/png;base64,Zm9v' }
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload, envelope);
  assert.deepEqual(response.payload, createNeedsReviewEnvelope());
});

test('Vercel OCR handler maps service errors to safe stable responses', async () => {
  const secretImage = 'data:image/png;base64,SECRET_IMAGE';
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

    const handler = createOcrHandler({
      ocrService: async () => {
        throw failure;
      }
    });
    const logged = [];
    const originalConsoleError = console.error;
    const response = createResponseRecorder();

    console.error = (...args) => logged.push(args);
    try {
      await handler({
        method: 'POST',
        body: { image: secretImage }
      }, response);
    } finally {
      console.error = originalConsoleError;
    }

    const serializedLog = serializeLogEntries(logged);
    const serializedResponse = JSON.stringify(response.payload);
    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.payload, {
      error: 'OCR processing failed',
      code: errorCase.expectedCode
    });
    assert.doesNotMatch(serializedResponse, /SECRET_IMAGE|base64|sk-secret-api-key/);
    assert.match(serializedLog, new RegExp(errorCase.expectedCode));
    assert.match(serializedLog, /500/);
    assert.doesNotMatch(serializedLog, /SECRET_IMAGE|base64|sk-secret-api-key/);
  }
});
