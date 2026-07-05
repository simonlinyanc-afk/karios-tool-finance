import { createHash, timingSafeEqual } from 'node:crypto';

export const MAX_REQUEST_BODY_BYTES = 15 * 1024 * 1024;
const MIN_PRODUCTION_TOKEN_LENGTH = 32;
const PUBLIC_TOKEN_PLACEHOLDER = 'replace-with-a-long-random-internal-value';

const SECURITY_RESPONSES = Object.freeze({
  METHOD_NOT_ALLOWED: {
    statusCode: 405,
    error: '不支持此请求方式。',
    action: '请刷新页面后重新识别。'
  },
  OCR_ACCESS_DENIED: {
    statusCode: 403,
    error: '访问凭证无效，请重新输入后再试。',
    action: '请重新输入访问凭证，然后再次识别。'
  },
  SECURITY_NOT_CONFIGURED: {
    statusCode: 503,
    error: '识别服务暂不可用。',
    action: '请联系管理员完成服务配置后再试。'
  },
  REQUEST_TOO_LARGE: {
    statusCode: 413,
    error: '图片数据超过大小限制。',
    action: '请压缩图片或拆分文件后重新上传。'
  },
  UNSUPPORTED_MEDIA_TYPE: {
    statusCode: 415,
    error: '请求格式不受支持。',
    action: '请刷新页面后重新识别。'
  },
  INVALID_CONTENT_LENGTH: {
    statusCode: 400,
    error: '请求信息不完整。',
    action: '请刷新页面后重新识别。'
  },
  INVALID_REQUEST_BODY: {
    statusCode: 400,
    error: '请求内容无法读取。',
    action: '请刷新页面后重新识别。'
  },
  INVALID_IMAGE_DATA: {
    statusCode: 400,
    error: '图片内容无法读取。',
    action: '请重新选择 JPG 或 PNG 图片后再试。'
  }
});

export class OcrSecurityError extends Error {
  constructor(code, statusCode, options = {}) {
    super(code, options);
    this.name = 'OcrSecurityError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function getHeader(headers = {}, name) {
  if (typeof headers?.get === 'function') return headers.get(name);
  const direct = headers?.[name] ?? headers?.[name.toLowerCase()];
  if (direct !== undefined) return Array.isArray(direct) ? undefined : direct;
  const key = Object.keys(headers || {}).find(
    (candidate) => candidate.toLowerCase() === name.toLowerCase()
  );
  const value = key ? headers[key] : undefined;
  return Array.isArray(value) ? undefined : value;
}

function securityError(code) {
  const response = SECURITY_RESPONSES[code] || SECURITY_RESPONSES.INVALID_REQUEST_BODY;
  return new OcrSecurityError(code, response.statusCode);
}

function isProduction(env) {
  return String(env?.NODE_ENV || '').trim().toLowerCase() === 'production';
}

function isAcceptableProductionToken(value) {
  const token = String(value || '').trim();
  return token.length >= MIN_PRODUCTION_TOKEN_LENGTH
    && token !== PUBLIC_TOKEN_PLACEHOLDER;
}

export function assertProductionSecurityConfig(env = process.env) {
  if (isProduction(env) && !isAcceptableProductionToken(env?.OCR_ACCESS_TOKEN)) {
    throw securityError('SECURITY_NOT_CONFIGURED');
  }
}

export function parseBearerToken(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^Bearer[ \t]+([^\s]+)$/iu);
  return match ? match[1] : null;
}

export function normalizeTokenSource(value) {
  const normalized = String(value || '').toLowerCase();
  return normalized === 'nginx' || normalized === 'session' ? normalized : 'direct';
}

function tokenDigest(value) {
  return createHash('sha256').update(String(value), 'utf8').digest();
}

export function authenticateOcrRequest({ headers = {}, env = process.env } = {}) {
  const configuredToken = String(env?.OCR_ACCESS_TOKEN || '').trim();
  const production = isProduction(env);
  const required = production || configuredToken.length > 0;
  const tokenSource = normalizeTokenSource(getHeader(headers, 'x-ocr-token-source'));

  if (!required) {
    return { tokenSource, authResult: 'development_bypass' };
  }
  if ((production && !isAcceptableProductionToken(configuredToken)) || !configuredToken) {
    throw securityError('SECURITY_NOT_CONFIGURED');
  }

  const suppliedToken = parseBearerToken(getHeader(headers, 'authorization'));
  const allowed = suppliedToken
    ? timingSafeEqual(tokenDigest(suppliedToken), tokenDigest(configuredToken))
    : false;
  if (!allowed) throw securityError('OCR_ACCESS_DENIED');

  return { tokenSource, authResult: 'allowed' };
}

export function assertJsonContentType(headers = {}) {
  const contentType = String(getHeader(headers, 'content-type') || '');
  if (!/^application\/json(?:\s*;\s*charset\s*=\s*utf-8)?\s*$/iu.test(contentType)) {
    throw securityError('UNSUPPORTED_MEDIA_TYPE');
  }
}

export function assertContentLength(headers = {}) {
  const raw = getHeader(headers, 'content-length');
  if (raw === undefined || raw === null || raw === '') return;
  if (!/^\d+$/u.test(String(raw))) throw securityError('INVALID_CONTENT_LENGTH');
  const length = Number(raw);
  if (!Number.isSafeInteger(length)) throw securityError('INVALID_CONTENT_LENGTH');
  if (length > MAX_REQUEST_BODY_BYTES) throw securityError('REQUEST_TOO_LARGE');
}

export function getParsedBodySize(body) {
  let serialized;
  try {
    serialized = JSON.stringify(body);
  } catch {
    throw securityError('INVALID_REQUEST_BODY');
  }
  if (serialized === undefined) throw securityError('INVALID_REQUEST_BODY');
  const size = Buffer.byteLength(serialized, 'utf8');
  if (size > MAX_REQUEST_BODY_BYTES) throw securityError('REQUEST_TOO_LARGE');
  return size;
}

export function validateImageDataUrl(image) {
  if (typeof image !== 'string') throw securityError('INVALID_IMAGE_DATA');
  const match = image.match(/^data:image\/(?:jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/u);
  if (!match || match[1].length % 4 !== 0) throw securityError('INVALID_IMAGE_DATA');
  const decoded = Buffer.from(match[1], 'base64');
  if (decoded.length === 0 || decoded.toString('base64') !== match[1]) {
    throw securityError('INVALID_IMAGE_DATA');
  }
  return image;
}

export function toSecurityResponse(error) {
  const known = error instanceof OcrSecurityError
    ? SECURITY_RESPONSES[error.code]
    : null;
  const response = known || SECURITY_RESPONSES.INVALID_REQUEST_BODY;
  const code = known ? error.code : 'INVALID_REQUEST_BODY';
  return {
    statusCode: response.statusCode,
    payload: {
      error: response.error,
      code,
      action: response.action
    }
  };
}

export function createSecurityError(code) {
  return securityError(code);
}
