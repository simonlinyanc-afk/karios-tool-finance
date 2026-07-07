#!/usr/bin/env node

import { loadEnvFiles } from '../server.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const NATIVE_PATH = '/api/v1/services/aigc/multimodal-generation/generation';

function safeBoolean(value) {
  return Boolean(String(value || '').trim());
}

export function classifyQwenEndpoint(endpoint) {
  const raw = String(endpoint || '').trim();
  if (!raw) return 'missing';

  let url;
  try {
    url = new URL(raw);
  } catch {
    return 'invalid-url';
  }

  if (url.pathname.includes('/compatible-mode/')) return 'openai-compatible';
  if (url.pathname !== NATIVE_PATH) return 'unknown';
  if (url.hostname === 'dashscope.aliyuncs.com') return 'dashscope-public-native';
  if (/\.maas\.aliyuncs\.com$/u.test(url.hostname)) return 'dashscope-workspace-native';
  return 'dashscope-native-custom-host';
}

export function buildSafeQwenConfigReport(env = process.env) {
  const endpointType = classifyQwenEndpoint(env.QWEN_ENDPOINT);
  const apiMode = String(env.QWEN_API_MODE || 'dashscope-native').trim() || 'dashscope-native';
  const enableThinking = String(env.QWEN_ENABLE_THINKING ?? '').trim().toLowerCase();
  const models = {
    primary: String(env.QWEN_PRIMARY_MODEL || '').trim(),
    fallback: String(env.QWEN_FALLBACK_MODEL || '').trim(),
    highAccuracy: String(env.QWEN_HIGH_ACCURACY_MODEL || '').trim()
  };
  const configured = {
    apiKey: safeBoolean(env.QWEN_API_KEY),
    endpoint: safeBoolean(env.QWEN_ENDPOINT),
    workspaceId: safeBoolean(env.QWEN_WORKSPACE_ID),
    workspaceName: safeBoolean(env.QWEN_WORKSPACE_NAME),
    primaryModel: safeBoolean(models.primary),
    fallbackModel: safeBoolean(models.fallback),
    highAccuracyModel: safeBoolean(models.highAccuracy)
  };
  const problems = [];

  if (!configured.apiKey) problems.push('missing_api_key');
  if (!configured.endpoint) problems.push('missing_endpoint');
  if (endpointType === 'invalid-url') problems.push('invalid_endpoint_url');
  if (endpointType === 'openai-compatible') problems.push('openai_compatible_endpoint_not_supported_by_current_client');
  if (!endpointType.includes('native') && endpointType !== 'missing' && endpointType !== 'invalid-url') {
    problems.push('endpoint_is_not_dashscope_native_generation');
  }
  if (apiMode !== 'dashscope-native') problems.push('api_mode_must_be_dashscope_native');
  if (enableThinking !== 'false') problems.push('thinking_must_be_false');
  if (!configured.primaryModel) problems.push('missing_primary_model');
  if (!configured.fallbackModel) problems.push('missing_fallback_model');
  if (!configured.highAccuracyModel) problems.push('missing_high_accuracy_model');

  return {
    ok: problems.length === 0,
    configured,
    endpointType,
    workspaceId: String(env.QWEN_WORKSPACE_ID || '').trim() || null,
    apiMode,
    thinking: enableThinking || null,
    timeoutMs: Number(env.QWEN_TIMEOUT_MS || 60000),
    maxRetries: Number(env.QWEN_MAX_RETRIES || 1),
    models,
    problems
  };
}

export async function main() {
  await loadEnvFiles(process.cwd());
  const report = buildSafeQwenConfigReport(process.env);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      error: 'CONFIG_PROBE_FAILED',
      message: error?.message || '配置探针运行失败。'
    }));
    process.exit(1);
  });
}
