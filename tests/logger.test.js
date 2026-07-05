import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createOcrLogger,
  createRequestId,
  sanitizeLogFields
} from '../api/logger.js';

test('request IDs are opaque unique UUIDs', () => {
  const first = createRequestId();
  const second = createRequestId();
  assert.match(first, /^[0-9a-f-]{36}$/u);
  assert.notEqual(first, second);
});

test('log sanitization keeps only the approved fields and normalizes values', () => {
  const secret = 'data:image/png;base64,SECRET_IMAGE';
  const sanitized = sanitizeLogFields({
    requestId: 'request-1\nforged',
    model: 'qwen-test\nforged',
    latencyMs: 20.6,
    status: 403,
    errorType: 'OCR_ACCESS_DENIED',
    tokenSource: 'not-an-approved-source',
    authResult: 'denied',
    body: { image: secret },
    authorization: 'Bearer secret',
    apiKey: 'sk-secret',
    error: new Error(secret),
    stack: secret
  });

  assert.deepEqual(sanitized, {
    requestId: 'request-1 forged',
    model: 'qwen-test forged',
    latencyMs: 21,
    status: 403,
    errorType: 'OCR_ACCESS_DENIED',
    tokenSource: 'direct',
    authResult: 'denied'
  });
  assert.deepEqual(Object.keys(sanitized), [
    'requestId',
    'model',
    'latencyMs',
    'status',
    'errorType',
    'tokenSource',
    'authResult'
  ]);
  assert.doesNotMatch(JSON.stringify(sanitized), /SECRET_IMAGE|base64|Bearer|sk-secret/u);
});

test('logger writes one structured line and never serializes unapproved inputs', () => {
  const lines = [];
  const logger = createOcrLogger({ write: (line) => lines.push(line) });

  const output = logger.log({
    requestId: 'request-2',
    status: 'ready',
    tokenSource: 'nginx',
    authResult: 'allowed',
    rawError: new Error('SECRET_STACK'),
    image: 'data:image/png;base64,SECRET_IMAGE'
  });

  assert.equal(lines.length, 1);
  assert.equal(lines[0], output);
  assert.equal(lines[0].split('\n').length, 1);
  assert.deepEqual(JSON.parse(lines[0]), {
    requestId: 'request-2',
    status: 'ready',
    tokenSource: 'nginx',
    authResult: 'allowed'
  });
  assert.doesNotMatch(lines[0], /SECRET_STACK|SECRET_IMAGE|base64/u);
});
