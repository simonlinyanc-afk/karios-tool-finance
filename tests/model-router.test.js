import test from 'node:test';
import assert from 'node:assert/strict';

import { QwenClientError } from '../api/qwen-client.js';
import {
  loadModelRoutingConfig,
  routeModelRequest,
  shouldUseFallback
} from '../api/model-router.js';

const TEST_ENV = {
  QWEN_PRIMARY_MODEL: 'primary-test-model',
  QWEN_FALLBACK_MODEL: 'review-test-model',
  QWEN_HIGH_ACCURACY_MODEL: 'accuracy-test-model'
};

test('loadModelRoutingConfig reads all model names from environment variables', () => {
  assert.deepEqual(loadModelRoutingConfig(TEST_ENV), {
    primary: 'primary-test-model',
    fallback: 'review-test-model',
    highAccuracy: 'accuracy-test-model'
  });

  for (const key of Object.keys(TEST_ENV)) {
    assert.throws(
      () => loadModelRoutingConfig({ ...TEST_ENV, [key]: '' }),
      (error) => error.code === 'CONFIG_ERROR' && error.canFallback === false
    );
  }
});

test('normal mode returns a successful primary result without fallback', async () => {
  const calls = [];
  const result = await routeModelRequest({
    mode: 'normal',
    models: loadModelRoutingConfig(TEST_ENV),
    invokeModel: async (request) => {
      calls.push(request);
      return { d: '2026-07-05' };
    },
    now: (() => {
      const values = [100, 124];
      return () => values.shift();
    })()
  });

  assert.deepEqual(calls, [
    { model: 'primary-test-model', attempt: 'primary' }
  ]);
  assert.deepEqual(result, {
    result: { d: '2026-07-05' },
    meta: {
      model: 'primary-test-model',
      fallbackUsed: false,
      latencyMs: 24
    }
  });
});

test('normal mode uses fallback after a retryable primary error', async () => {
  const calls = [];
  const result = await routeModelRequest({
    mode: 'normal',
    models: loadModelRoutingConfig(TEST_ENV),
    invokeModel: async (request) => {
      calls.push(request);
      if (request.attempt === 'primary') {
        throw new QwenClientError('temporary failure', {
          code: 'UPSTREAM_NETWORK_ERROR',
          canFallback: true
        });
      }
      return { d: '2026-07-05' };
    },
    now: () => 100
  });

  assert.deepEqual(calls.map(call => call.model), [
    'primary-test-model',
    'review-test-model'
  ]);
  assert.equal(result.meta.model, 'review-test-model');
  assert.equal(result.meta.fallbackUsed, true);
});

test('normal mode uses fallback when primary result validation fails', async () => {
  const calls = [];
  const result = await routeModelRequest({
    mode: 'normal',
    models: loadModelRoutingConfig(TEST_ENV),
    invokeModel: async (request) => {
      calls.push(request);
      return request.attempt === 'primary'
        ? { valid: false }
        : { valid: true };
    },
    validateResult: (value) => value.valid,
    now: () => 100
  });

  assert.deepEqual(calls.map(call => call.attempt), ['primary', 'fallback']);
  assert.deepEqual(result.result, { valid: true });
  assert.equal(result.meta.fallbackUsed, true);
});

test('normal mode does not use fallback for configuration or authentication errors', async () => {
  for (const error of [
    new QwenClientError('configuration failed', {
      code: 'CONFIG_ERROR',
      canFallback: false
    }),
    new QwenClientError('authentication failed', {
      code: 'UPSTREAM_HTTP_ERROR',
      statusCode: 401,
      canFallback: false
    })
  ]) {
    const calls = [];
    await assert.rejects(
      routeModelRequest({
        mode: 'normal',
        models: loadModelRoutingConfig(TEST_ENV),
        invokeModel: async (request) => {
          calls.push(request);
          throw error;
        }
      }),
      (caught) => caught === error
    );
    assert.deepEqual(calls.map(call => call.attempt), ['primary']);
  }
});

test('high_accuracy mode only invokes the enhanced recognition model', async () => {
  const calls = [];
  const result = await routeModelRequest({
    mode: 'high_accuracy',
    models: loadModelRoutingConfig(TEST_ENV),
    invokeModel: async (request) => {
      calls.push(request);
      return { d: '2026-07-05' };
    },
    now: () => 100
  });

  assert.deepEqual(calls, [
    { model: 'accuracy-test-model', attempt: 'high_accuracy' }
  ]);
  assert.equal(result.meta.model, 'accuracy-test-model');
  assert.equal(result.meta.fallbackUsed, false);
});

test('routeModelRequest rejects an unsupported mode before invoking a model', async () => {
  let calls = 0;
  await assert.rejects(
    routeModelRequest({
      mode: 'unexpected',
      models: loadModelRoutingConfig(TEST_ENV),
      invokeModel: async () => {
        calls += 1;
      }
    }),
    (error) => error.code === 'CONFIG_ERROR' && error.canFallback === false
  );
  assert.equal(calls, 0);
});

test('shouldUseFallback only accepts errors explicitly marked retryable', () => {
  assert.equal(shouldUseFallback({ canFallback: true }), true);
  assert.equal(shouldUseFallback({ canFallback: false }), false);
  assert.equal(shouldUseFallback(new Error('unknown')), false);
});
