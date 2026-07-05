import { randomUUID } from 'node:crypto';

import { normalizeTokenSource } from './security.js';

const AUTH_RESULTS = new Set([
  'allowed',
  'denied',
  'development_bypass',
  'configuration_error'
]);

function safeText(value, maxLength = 160) {
  if (typeof value !== 'string' || !value) return undefined;
  const normalized = value.replace(/[\r\n\t]+/gu, ' ').slice(0, maxLength);
  if (/data:image|base64|bearer\s|(?:^|[^a-z])sk-[a-z0-9]/iu.test(normalized)) {
    return undefined;
  }
  return normalized;
}

export function createRequestId() {
  return randomUUID();
}

export function sanitizeLogFields(fields = {}) {
  const output = {};
  const requestId = safeText(fields.requestId);
  const model = safeText(fields.model);
  const latency = Number(fields.latencyMs);
  const status = typeof fields.status === 'number'
    ? fields.status
    : safeText(fields.status, 64);
  const errorType = safeText(fields.errorType, 96);
  const authResult = AUTH_RESULTS.has(fields.authResult) ? fields.authResult : undefined;

  if (requestId !== undefined) output.requestId = requestId;
  if (model !== undefined) output.model = model;
  if (Number.isFinite(latency) && latency >= 0) output.latencyMs = Math.round(latency);
  if (status !== undefined) output.status = status;
  if (errorType !== undefined) output.errorType = errorType;
  if (fields.tokenSource !== undefined) output.tokenSource = normalizeTokenSource(fields.tokenSource);
  if (authResult !== undefined) output.authResult = authResult;

  return output;
}

export function createOcrLogger({ write = (line) => console.log(line) } = {}) {
  return Object.freeze({
    log(fields) {
      const line = JSON.stringify(sanitizeLogFields(fields));
      write(line);
      return line;
    }
  });
}

export const ocrLogger = createOcrLogger();
