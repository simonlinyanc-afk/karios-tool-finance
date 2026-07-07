import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSafeQwenConfigReport,
  classifyQwenEndpoint
} from '../scripts/check-qwen-config.mjs';

const BASE_ENV = {
  QWEN_API_KEY: 'sk-secret-value-that-must-not-leak',
  QWEN_ENDPOINT: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
  QWEN_WORKSPACE_ID: 'ws-kairos-demo',
  QWEN_WORKSPACE_NAME: 'Kairos Finance',
  QWEN_API_MODE: 'dashscope-native',
  QWEN_PRIMARY_MODEL: 'qwen3-vl-flash',
  QWEN_FALLBACK_MODEL: 'qwen3.7-plus',
  QWEN_HIGH_ACCURACY_MODEL: 'qwen3-vl-plus',
  QWEN_ENABLE_THINKING: 'false',
  QWEN_TIMEOUT_MS: '60000',
  QWEN_MAX_RETRIES: '1'
};

test('config probe reports only safe DashScope native metadata', () => {
  const report = buildSafeQwenConfigReport(BASE_ENV);
  const serialized = JSON.stringify(report);

  assert.equal(report.ok, true);
  assert.equal(report.configured.apiKey, true);
  assert.equal(report.endpointType, 'dashscope-public-native');
  assert.equal(report.workspaceId, 'ws-kairos-demo');
  assert.equal(report.apiMode, 'dashscope-native');
  assert.deepEqual(report.models, {
    primary: 'qwen3-vl-flash',
    fallback: 'qwen3.7-plus',
    highAccuracy: 'qwen3-vl-plus'
  });
  assert.doesNotMatch(serialized, /sk-secret-value-that-must-not-leak/u);
});

test('config probe recognizes workspace native endpoint', () => {
  assert.equal(
    classifyQwenEndpoint('https://ws123.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'),
    'dashscope-workspace-native'
  );
});

test('config probe rejects OpenAI compatible endpoint for current client', () => {
  const report = buildSafeQwenConfigReport({
    ...BASE_ENV,
    QWEN_ENDPOINT: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
  });

  assert.equal(report.ok, false);
  assert.equal(report.endpointType, 'openai-compatible');
  assert.match(report.problems.join(','), /openai_compatible_endpoint_not_supported/u);
});

test('config probe rejects non-native API mode', () => {
  const report = buildSafeQwenConfigReport({
    ...BASE_ENV,
    QWEN_API_MODE: 'openAiCompatible'
  });

  assert.equal(report.ok, false);
  assert.equal(report.apiMode, 'openAiCompatible');
  assert.match(report.problems.join(','), /api_mode_must_be_dashscope_native/u);
});
