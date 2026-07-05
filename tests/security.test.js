import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_REQUEST_BODY_BYTES,
  OcrSecurityError,
  assertContentLength,
  assertJsonContentType,
  assertProductionSecurityConfig,
  authenticateOcrRequest,
  getParsedBodySize,
  normalizeTokenSource,
  parseBearerToken,
  toSecurityResponse,
  validateImageDataUrl
} from '../api/security.js';

const TOKEN = 'phase3-test-secret-with-enough-entropy';

test('production configuration requires a non-empty access credential', () => {
  assert.throws(
    () => assertProductionSecurityConfig({ NODE_ENV: 'production' }),
    (error) => error instanceof OcrSecurityError && error.code === 'SECURITY_NOT_CONFIGURED'
  );
  assert.doesNotThrow(() => assertProductionSecurityConfig({
    NODE_ENV: 'production',
    OCR_ACCESS_TOKEN: TOKEN
  }));
  assert.doesNotThrow(() => assertProductionSecurityConfig({ NODE_ENV: 'development' }));
});

test('production detection is normalized and rejects placeholders or weak credentials', () => {
  for (const env of [
    { NODE_ENV: 'production ' },
    { NODE_ENV: 'PRODUCTION' },
    {
      NODE_ENV: 'production',
      OCR_ACCESS_TOKEN: 'replace-with-a-long-random-internal-value'
    },
    { NODE_ENV: 'production', OCR_ACCESS_TOKEN: 'too-short' }
  ]) {
    assert.throws(
      () => assertProductionSecurityConfig(env),
      (error) => error instanceof OcrSecurityError
        && error.code === 'SECURITY_NOT_CONFIGURED'
    );
  }

  assert.throws(
    () => authenticateOcrRequest({ headers: {}, env: { NODE_ENV: ' PRODUCTION ' } }),
    (error) => error.code === 'SECURITY_NOT_CONFIGURED' && error.statusCode === 503
  );
});

test('Bearer parsing is strict and authentication is required whenever configured', () => {
  assert.equal(parseBearerToken(`Bearer ${TOKEN}`), TOKEN);
  assert.equal(parseBearerToken(`bearer ${TOKEN}`), TOKEN);
  assert.equal(parseBearerToken(`Basic ${TOKEN}`), null);
  assert.equal(parseBearerToken('Bearer'), null);

  assert.deepEqual(authenticateOcrRequest({
    headers: { authorization: `Bearer ${TOKEN}`, 'x-ocr-token-source': 'session' },
    env: { NODE_ENV: 'production', OCR_ACCESS_TOKEN: TOKEN }
  }), { tokenSource: 'session', authResult: 'allowed' });

  assert.throws(
    () => authenticateOcrRequest({
      headers: { authorization: 'Bearer wrong' },
      env: { NODE_ENV: 'development', OCR_ACCESS_TOKEN: TOKEN }
    }),
    (error) => error.statusCode === 403 && error.code === 'OCR_ACCESS_DENIED'
  );

  assert.deepEqual(authenticateOcrRequest({
    headers: {},
    env: { NODE_ENV: 'development' }
  }), { tokenSource: 'direct', authResult: 'development_bypass' });
});

test('ambiguous array or duplicate authorization values are rejected', () => {
  for (const authorization of [
    [`Bearer ${TOKEN}`],
    [`Bearer ${TOKEN}`, 'Bearer other'],
    `Bearer ${TOKEN}, Bearer other`
  ]) {
    assert.throws(
      () => authenticateOcrRequest({
        headers: { authorization },
        env: { NODE_ENV: 'production', OCR_ACCESS_TOKEN: TOKEN }
      }),
      (error) => error.statusCode === 403 && error.code === 'OCR_ACCESS_DENIED'
    );
  }
});

test('token source accepts only nginx session or direct', () => {
  assert.equal(normalizeTokenSource('nginx'), 'nginx');
  assert.equal(normalizeTokenSource('session'), 'session');
  assert.equal(normalizeTokenSource('DIRECT'), 'direct');
  assert.equal(normalizeTokenSource('secret-value'), 'direct');
});

test('content type accepts only application/json with optional parameters', () => {
  assert.doesNotThrow(() => assertJsonContentType({ 'content-type': 'application/json' }));
  assert.doesNotThrow(() => assertJsonContentType({ 'content-type': 'application/json; charset=utf-8' }));
  for (const contentType of [
    undefined,
    'text/plain',
    'application/ld+json',
    'application/jsonp',
    ['application/json'],
    ['application/json', 'text/plain'],
    'application/json, text/plain',
    'application/json; boundary=something',
    'application/json; charset=utf-8; version=1',
    'application/json; charset=gbk'
  ]) {
    assert.throws(
      () => assertJsonContentType({ 'content-type': contentType }),
      (error) => error.statusCode === 415 && error.code === 'UNSUPPORTED_MEDIA_TYPE'
    );
  }
});

test('content length and parsed bodies enforce the 15 MiB boundary', () => {
  assert.equal(MAX_REQUEST_BODY_BYTES, 15 * 1024 * 1024);
  assert.doesNotThrow(() => assertContentLength({ 'content-length': String(MAX_REQUEST_BODY_BYTES) }));
  assert.throws(
    () => assertContentLength({ 'content-length': String(MAX_REQUEST_BODY_BYTES + 1) }),
    (error) => error.statusCode === 413 && error.code === 'REQUEST_TOO_LARGE'
  );
  assert.throws(
    () => assertContentLength({ 'content-length': '-1' }),
    (error) => error.statusCode === 400 && error.code === 'INVALID_CONTENT_LENGTH'
  );
  assert.throws(
    () => assertContentLength({ 'content-length': 'abc' }),
    (error) => error.statusCode === 400 && error.code === 'INVALID_CONTENT_LENGTH'
  );

  const exact = { image: 'x'.repeat(MAX_REQUEST_BODY_BYTES - Buffer.byteLength('{"image":""}')) };
  assert.equal(getParsedBodySize(exact), MAX_REQUEST_BODY_BYTES);
  assert.throws(
    () => getParsedBodySize({ image: `${exact.image}x` }),
    (error) => error.statusCode === 413 && error.code === 'REQUEST_TOO_LARGE'
  );
});

test('only non-empty jpeg and png base64 data URLs are accepted', () => {
  assert.equal(validateImageDataUrl('data:image/jpeg;base64,Zm9v'), 'data:image/jpeg;base64,Zm9v');
  assert.equal(validateImageDataUrl('data:image/png;base64,AA=='), 'data:image/png;base64,AA==');
  for (const image of [
    undefined,
    '',
    'data:image/webp;base64,Zm9v',
    'data:image/png,Zm9v',
    'data:image/png;base64,',
    'data:image/png;base64,not base64!',
    'data:image/png;base64,abc',
    'data:image/png;base64,AB==',
    'data:image/png;base64,AAB='
  ]) {
    assert.throws(
      () => validateImageDataUrl(image),
      (error) => error.statusCode === 400 && error.code === 'INVALID_IMAGE_DATA'
    );
  }
});

test('security responses are stable actionable and hide configuration details', () => {
  const denied = toSecurityResponse(new OcrSecurityError('OCR_ACCESS_DENIED', 403));
  assert.equal(denied.statusCode, 403);
  assert.deepEqual(denied.payload, {
    error: '访问凭证无效，请重新输入后再试。',
    code: 'OCR_ACCESS_DENIED',
    action: '请重新输入访问凭证，然后再次识别。'
  });

  const missingConfig = JSON.stringify(toSecurityResponse(
    new OcrSecurityError('SECURITY_NOT_CONFIGURED', 503)
  ));
  assert.doesNotMatch(missingConfig, /OCR_ACCESS_TOKEN|Bearer|Token|环境变量/u);
});
