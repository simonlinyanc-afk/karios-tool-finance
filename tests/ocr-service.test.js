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
      choices: [{
        finish_reason: 'stop',
        message: {
          role: 'assistant',
          content: [{ text }]
        }
      }]
    },
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
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

function readyInvoice(overrides = {}) {
  return JSON.stringify({
    d: '2026-07-05',
    n: 'INV-001',
    b: 'Kairos',
    m: '供应商',
    t: 106,
    x: 6,
    y: 100,
    w: 106,
    s: '办公用品',
    ...overrides
  });
}

test('recognizeInvoiceFromImage returns the formal ready envelope', async () => {
  const requests = [];
  const result = await recognizeInvoiceFromImage({
    image: TEST_IMAGE,
    env: createEnv(),
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return createResponse(createModelPayload(readyInvoice()));
    },
    now: () => 100
  });

  assert.deepEqual(Object.keys(result).sort(), ['data', 'meta', 'status', 'warnings']);
  assert.equal(result.status, 'ready');
  assert.equal(result.data.date, '2026-07-05');
  assert.equal(result.data.invoiceNumber, 'INV-001');
  assert.equal(result.data.amount, 106);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.meta, {
    model: 'primary-test-model',
    fallbackUsed: false,
    latencyMs: 0
  });
  assert.equal(requests.length, 1);
});

test('unreadable primary output rechecks the same image and returns a ready fallback envelope', async () => {
  const firstRawOutput = 'FIRST_RAW_OUTPUT_SHOULD_NOT_REPEAT';
  const requests = [];
  const payloads = [
    createModelPayload(firstRawOutput),
    createModelPayload(readyInvoice({ n: 'INV-REVIEWED' }))
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
  assert.doesNotMatch(fallbackPrompt, new RegExp(firstRawOutput));
  assert.equal(result.status, 'ready');
  assert.equal(result.data.invoiceNumber, 'INV-REVIEWED');
  assert.equal(result.meta.model, 'review-test-model');
  assert.equal(result.meta.fallbackUsed, true);
});

test('exhausted primary HTTP retries use fallback and retain fallback metadata', async () => {
  const requests = [];
  const result = await recognizeInvoiceFromImage({
    image: TEST_IMAGE,
    env: createEnv({ QWEN_MAX_RETRIES: '1' }),
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      if (requests.length <= 2) {
        return {
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
          json: async () => ({ message: 'temporary outage' })
        };
      }
      return createResponse(createModelPayload(readyInvoice({ n: 'REVIEWED-503' })));
    },
    now: () => 100
  });

  assert.deepEqual(requests.map(request => request.model), [
    'primary-test-model',
    'primary-test-model',
    'review-test-model'
  ]);
  assert.equal(result.status, 'ready');
  assert.equal(result.data.invoiceNumber, 'REVIEWED-503');
  assert.equal(result.meta.fallbackUsed, true);
});

test('an incomplete primary result triggers fallback and can become ready', async () => {
  const requests = [];
  const payloads = [
    createModelPayload('{"d":"","n":"PRIMARY","t":106,"w":106}'),
    createModelPayload(readyInvoice({ n: 'REVIEWED' }))
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
  assert.equal(result.status, 'ready');
  assert.equal(result.data.invoiceNumber, 'REVIEWED');
  assert.deepEqual(result.warnings, []);
});

test('a primary result with mixed positive and negative totals triggers fallback', async () => {
  const requests = [];
  const payloads = [
    createModelPayload(readyInvoice({ t: -1, w: 106 })),
    createModelPayload(readyInvoice({ n: 'REVIEWED-NEGATIVE' }))
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
  assert.equal(result.status, 'ready');
  assert.equal(result.data.invoiceNumber, 'REVIEWED-NEGATIVE');
  assert.equal(result.meta.fallbackUsed, true);
});

test('a primary result with a missing-tax relationship mismatch triggers fallback', async () => {
  const requests = [];
  const payloads = [
    createModelPayload(readyInvoice({ x: null, y: 100, t: 106, w: 106 })),
    createModelPayload(readyInvoice({ n: 'REVIEWED-MISSING-TAX' }))
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
  assert.equal(result.status, 'ready');
  assert.equal(result.data.invoiceNumber, 'REVIEWED-MISSING-TAX');
  assert.equal(result.meta.fallbackUsed, true);
});

test('an incomplete fallback result is returned as needs_review with editable data', async () => {
  const payloads = [
    createModelPayload('{"d":"","n":"PRIMARY"}'),
    createModelPayload('{"d":"2026-07-05","n":"REVIEWED","s":"已识别摘要"}')
  ];

  const result = await recognizeInvoiceFromImage({
    image: TEST_IMAGE,
    env: createEnv(),
    fetchImpl: async () => createResponse(payloads.shift()),
    now: () => 100
  });

  assert.equal(result.status, 'needs_review');
  assert.equal(result.data.invoiceNumber, 'REVIEWED');
  assert.equal(result.data.description, '已识别摘要');
  assert.equal(result.warnings.some(warning => warning.code === 'missing_amount'), true);
  assert.equal(result.meta.fallbackUsed, true);
});

test('high_accuracy returns an incomplete parseable result as needs_review without another model', async () => {
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
  assert.equal(result.status, 'needs_review');
  assert.equal(result.data.invoiceNumber, 'ACCURATE');
  assert.equal(result.warnings.some(warning => warning.code === 'missing_amount'), true);
  assert.equal(result.meta.fallbackUsed, false);
});

test('two unreadable normal-mode outputs return failed with fallback metadata', async () => {
  const requests = [];
  const outputs = ['not readable', '{"broken"'];
  const result = await recognizeInvoiceFromImage({
    image: TEST_IMAGE,
    env: createEnv(),
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return createResponse(createModelPayload(outputs.shift()));
    },
    now: () => 100
  });

  assert.deepEqual(requests.map(request => request.model), [
    'primary-test-model',
    'review-test-model'
  ]);
  assert.equal(result.status, 'failed');
  assert.deepEqual(result.warnings, [{
    code: 'unreadable_response',
    field: null,
    message: '暂时没有识别成功'
  }]);
  assert.equal(result.meta.model, 'review-test-model');
  assert.equal(result.meta.fallbackUsed, true);
});

test('unreadable high_accuracy output returns failed with enhanced model metadata', async () => {
  const result = await recognizeInvoiceFromImage({
    image: TEST_IMAGE,
    mode: 'high_accuracy',
    env: createEnv(),
    fetchImpl: async () => createResponse(createModelPayload('not readable')),
    now: () => 100
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.meta.model, 'accuracy-test-model');
  assert.equal(result.meta.fallbackUsed, false);
});

test('configuration, authentication, and network failures remain service errors', async () => {
  await assert.rejects(
    recognizeInvoiceFromImage({
      image: TEST_IMAGE,
      env: createEnv({ QWEN_API_KEY: '' }),
      fetchImpl: async () => { throw new Error('must not run'); }
    }),
    (error) => error.code === 'CONFIG_ERROR'
  );

  await assert.rejects(
    recognizeInvoiceFromImage({
      image: TEST_IMAGE,
      env: createEnv(),
      fetchImpl: async () => ({ ok: false, status: 401, statusText: 'Unauthorized' }),
      now: () => 100
    }),
    (error) => error.code === 'UPSTREAM_HTTP_ERROR' && error.statusCode === 401
  );

  let networkCalls = 0;
  await assert.rejects(
    recognizeInvoiceFromImage({
      image: TEST_IMAGE,
      env: createEnv(),
      fetchImpl: async () => {
        networkCalls += 1;
        throw new Error('network unavailable');
      },
      now: () => 100
    }),
    (error) => error.code === 'UPSTREAM_NETWORK_ERROR'
  );
  assert.equal(networkCalls, 2);
});
