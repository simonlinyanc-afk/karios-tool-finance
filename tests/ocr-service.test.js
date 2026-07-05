import test from 'node:test';
import assert from 'node:assert/strict';

import { recognizeInvoiceFromImage } from '../api/ocr-service.js';

const TEST_IMAGE = 'data:image/jpeg;base64,compressed-invoice';

function createEnv(overrides = {}) {
  return {
    QWEN_API_KEY: 'test-key',
    QWEN_ENDPOINT: 'https://example.test/qwen',
    QWEN_PRIMARY_MODEL: 'primary-test-model',
    QWEN_FALLBACK_MODEL: 'review-test-model',
    QWEN_HIGH_ACCURACY_MODEL: 'accuracy-test-model',
    QWEN_ENABLE_THINKING: 'false',
    QWEN_TIMEOUT_MS: '60000',
    QWEN_MAX_RETRIES: '0',
    ...overrides
  };
}

function createModelPayload(text) {
  return {
    output: {
      choices: [
        {
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            content: [{ text }]
          }
        }
      ]
    },
    usage: {
      input_tokens: 1,
      output_tokens: 1,
      total_tokens: 2
    },
    request_id: 'test-request-id'
  };
}

function createResponse(payload) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => payload
  };
}

test('recognizeInvoiceFromImage returns root invoice fields with technical meta', async () => {
  const requests = [];
  const result = await recognizeInvoiceFromImage({
    image: TEST_IMAGE,
    env: createEnv(),
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return createResponse(createModelPayload('{"d":"2026-07-05","t":106}'));
    },
    now: () => 100
  });

  assert.equal(result.d, '2026-07-05');
  assert.equal(result.t, 106);
  assert.deepEqual(result.meta, {
    model: 'primary-test-model',
    fallbackUsed: false,
    latencyMs: 0
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].model, 'primary-test-model');
});

test('JSON extraction failure rechecks the same compressed image with fallback model', async () => {
  const firstRawOutput = 'FIRST_RAW_OUTPUT_SHOULD_NOT_REPEAT';
  const requests = [];
  const payloads = [
    createModelPayload(firstRawOutput),
    createModelPayload('{"d":"2026-07-05","n":"INV-2","t":88,"x":5,"w":88}')
  ];

  const result = await recognizeInvoiceFromImage({
    image: TEST_IMAGE,
    env: createEnv(),
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return createResponse(payloads.shift());
    },
    now: () => 100
  });

  assert.deepEqual(requests.map(request => request.model), [
    'primary-test-model',
    'review-test-model'
  ]);
  assert.equal(requests[0].input.messages[0].content[0].image, TEST_IMAGE);
  assert.equal(requests[1].input.messages[0].content[0].image, TEST_IMAGE);

  const fallbackPrompt = requests[1].input.messages[0].content[1].text;
  assert.match(fallbackPrompt, /重新独立查看原图/);
  assert.match(fallbackPrompt, /日期/);
  assert.match(fallbackPrompt, /发票号码/);
  assert.match(fallbackPrompt, /金额/);
  assert.match(fallbackPrompt, /税额/);
  assert.match(fallbackPrompt, /价税合计/);
  assert.doesNotMatch(fallbackPrompt, new RegExp(firstRawOutput));

  assert.equal(result.n, 'INV-2');
  assert.equal(result.meta.model, 'review-test-model');
  assert.equal(result.meta.fallbackUsed, true);
});

test('exhausted primary 503 retries use fallback model and return fallback meta', async () => {
  const requests = [];
  const result = await recognizeInvoiceFromImage({
    image: TEST_IMAGE,
    env: createEnv({ QWEN_MAX_RETRIES: '1' }),
    fetchImpl: async (_url, options) => {
      const request = JSON.parse(options.body);
      requests.push(request);

      if (requests.length <= 2) {
        return {
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
          json: async () => ({ message: 'temporary outage' })
        };
      }

      return createResponse(createModelPayload('{"d":"2026-07-05","n":"REVIEWED-503"}'));
    },
    now: () => 100
  });

  assert.deepEqual(requests.map(request => request.model), [
    'primary-test-model',
    'primary-test-model',
    'review-test-model'
  ]);
  assert.equal(result.n, 'REVIEWED-503');
  assert.equal(result.meta.model, 'review-test-model');
  assert.equal(result.meta.fallbackUsed, true);
});

test('injected result validation failure triggers fallback recognition', async () => {
  const requests = [];
  const payloads = [
    createModelPayload('{"d":"2026-07-05","n":"PRIMARY"}'),
    createModelPayload('{"d":"2026-07-05","n":"REVIEWED"}')
  ];

  const result = await recognizeInvoiceFromImage({
    image: TEST_IMAGE,
    env: createEnv(),
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return createResponse(payloads.shift());
    },
    validateResult: (invoice) => invoice.n === 'REVIEWED',
    now: () => 100
  });

  assert.deepEqual(requests.map(request => request.model), [
    'primary-test-model',
    'review-test-model'
  ]);
  assert.equal(result.n, 'REVIEWED');
  assert.equal(result.meta.fallbackUsed, true);
});

test('high_accuracy mode only uses the enhanced recognition model', async () => {
  const requests = [];
  const result = await recognizeInvoiceFromImage({
    image: TEST_IMAGE,
    mode: 'high_accuracy',
    env: createEnv(),
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return createResponse(createModelPayload('{"d":"2026-07-05","n":"ACCURATE"}'));
    },
    now: () => 100
  });

  assert.deepEqual(requests.map(request => request.model), ['accuracy-test-model']);
  assert.equal(result.n, 'ACCURATE');
  assert.equal(result.meta.model, 'accuracy-test-model');
  assert.equal(result.meta.fallbackUsed, false);
});
