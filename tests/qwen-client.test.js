import test from 'node:test';
import assert from 'node:assert/strict';

import {
  QwenClientError,
  buildQwenRequest,
  createQwenClient,
  loadQwenClientConfig
} from '../api/qwen-client.js';

const TEST_IMAGE = 'data:image/jpeg;base64,Zm9v';

function createEnv(overrides = {}) {
  return {
    QWEN_API_KEY: 'test-key',
    QWEN_ENDPOINT: 'https://example.test/qwen',
    QWEN_ENABLE_THINKING: 'false',
    QWEN_TIMEOUT_MS: '60000',
    QWEN_MAX_RETRIES: '1',
    ...overrides
  };
}

function createResponse({ ok = true, status = 200, payload = {} } = {}) {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: async () => payload
  };
}

test('buildQwenRequest sends native multimodal JSON mode with thinking disabled', () => {
  const request = buildQwenRequest({
    model: 'primary-test-model',
    image: TEST_IMAGE,
    prompt: 'Return JSON'
  });

  assert.equal(request.model, 'primary-test-model');
  assert.equal(request.input.messages[0].content[0].image, TEST_IMAGE);
  assert.equal(request.input.messages[0].content[1].text, 'Return JSON');
  assert.equal(request.parameters.result_format, 'message');
  assert.equal(request.parameters.enable_thinking, false);
  assert.deepEqual(request.parameters.response_format, { type: 'json_object' });
});

test('loadQwenClientConfig requires credentials and endpoint', () => {
  assert.throws(
    () => loadQwenClientConfig(createEnv({ QWEN_API_KEY: '' })),
    (error) => error instanceof QwenClientError && error.code === 'CONFIG_ERROR'
  );
  assert.throws(
    () => loadQwenClientConfig(createEnv({ QWEN_ENDPOINT: '' })),
    (error) => error instanceof QwenClientError && error.code === 'CONFIG_ERROR'
  );
});

test('loadQwenClientConfig rejects thinking mode while JSON mode is active', () => {
  assert.throws(
    () => loadQwenClientConfig(createEnv({ QWEN_ENABLE_THINKING: 'true' })),
    /QWEN_ENABLE_THINKING/
  );
});

test('loadQwenClientConfig parses finite non-negative timeout and retry settings', () => {
  assert.deepEqual(loadQwenClientConfig(createEnv({
    QWEN_TIMEOUT_MS: '45000',
    QWEN_MAX_RETRIES: '2'
  })), {
    apiKey: 'test-key',
    endpoint: 'https://example.test/qwen',
    enableThinking: false,
    timeoutMs: 45000,
    maxRetries: 2
  });

  for (const [key, value] of [
    ['QWEN_TIMEOUT_MS', '-1'],
    ['QWEN_TIMEOUT_MS', 'Infinity'],
    ['QWEN_MAX_RETRIES', '1.5']
  ]) {
    assert.throws(
      () => loadQwenClientConfig(createEnv({ [key]: value })),
      (error) => error instanceof QwenClientError && error.code === 'CONFIG_ERROR'
    );
  }
});

test('Qwen client retries 408, 429, and 5xx responses before succeeding', async () => {
  const statuses = [408, 429, 503, 200];
  const calls = [];
  const client = createQwenClient({
    env: createEnv({ QWEN_MAX_RETRIES: '3' }),
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      const status = statuses.shift();
      return createResponse({
        ok: status === 200,
        status,
        payload: status === 200 ? { output: { choices: [] } } : { message: 'retry' }
      });
    }
  });

  const payload = await client.generate({
    model: 'primary-test-model',
    image: TEST_IMAGE,
    prompt: 'Return JSON'
  });

  assert.deepEqual(payload, { output: { choices: [] } });
  assert.equal(calls.length, 4);
  assert.equal(calls[0].url, 'https://example.test/qwen');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-key');
});

test('Qwen client retries a network error within the shared request budget', async () => {
  let calls = 0;
  const client = createQwenClient({
    env: createEnv(),
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) throw new TypeError('network unavailable');
      return createResponse({ payload: { ok: true } });
    }
  });

  assert.deepEqual(await client.generate({
    model: 'primary-test-model',
    image: TEST_IMAGE,
    prompt: 'Return JSON'
  }), { ok: true });
  assert.equal(calls, 2);
});

test('Qwen client total timeout also covers reading the response body', async () => {
  const client = createQwenClient({
    env: createEnv({
      QWEN_TIMEOUT_MS: '5',
      QWEN_MAX_RETRIES: '0'
    }),
    fetchImpl: async (_url, options) => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const error = new Error('body read aborted');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      })
    })
  });

  const generation = client.generate({
    model: 'primary-test-model',
    image: TEST_IMAGE,
    prompt: 'Return JSON'
  });
  const guard = new Promise((resolve, reject) => {
    setTimeout(() => reject(new Error('test guard timed out')), 50);
  });

  await assert.rejects(
    Promise.race([generation, guard]),
    (error) => (
      error instanceof QwenClientError &&
      error.code === 'UPSTREAM_TIMEOUT' &&
      error.canFallback === true
    )
  );
});

test('Qwen client does not retry request, authentication, or permission failures', async () => {
  for (const status of [400, 401, 403]) {
    let calls = 0;
    const client = createQwenClient({
      env: createEnv({ QWEN_MAX_RETRIES: '3' }),
      fetchImpl: async () => {
        calls += 1;
        return createResponse({ ok: false, status, payload: { message: 'denied' } });
      }
    });

    await assert.rejects(
      client.generate({
        model: 'primary-test-model',
        image: TEST_IMAGE,
        prompt: 'Return JSON'
      }),
      (error) => (
        error instanceof QwenClientError &&
        error.statusCode === status &&
        error.canFallback === false
      )
    );
    assert.equal(calls, 1);
  }
});

test('Qwen client errors do not expose image data or API keys', async () => {
  const secretImage = 'data:image/png;base64,very-secret-image-content';
  const secretKey = 'very-secret-api-key';
  const client = createQwenClient({
    env: createEnv({ QWEN_API_KEY: secretKey, QWEN_MAX_RETRIES: '0' }),
    fetchImpl: async () => createResponse({
      ok: false,
      status: 500,
      payload: { message: `${secretImage} ${secretKey}` }
    })
  });

  await assert.rejects(
    client.generate({
      model: 'primary-test-model',
      image: secretImage,
      prompt: 'Return JSON'
    }),
    (error) => {
      const serialized = [
        error.message,
        error.stack,
        JSON.stringify(error)
      ].join('\n');
      assert.doesNotMatch(serialized, /very-secret-image-content/);
      assert.doesNotMatch(serialized, /very-secret-api-key/);
      assert.doesNotMatch(serialized, /base64/);
      return true;
    }
  );
});
