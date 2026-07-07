import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { createRequestId, ocrLogger } from './api/logger.js';
import { mapOcrServiceError, recognizeInvoiceFromImage } from './api/ocr-service.js';
import {
  MAX_REQUEST_BODY_BYTES,
  OcrSecurityError,
  assertContentLength,
  assertJsonContentType,
  assertProductionSecurityConfig,
  authenticateOcrRequest,
  createSecurityError,
  normalizeTokenSource,
  toSecurityResponse,
  validateImageDataUrl
} from './api/security.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.bcmap': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8'
};

function setDefaultEnvVar(key, value) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
}

export async function loadEnvFiles(rootDir = process.cwd()) {
  const envFiles = ['.env.local', '.env'];

  for (const fileName of envFiles) {
    const fullPath = path.join(rootDir, fileName);

    try {
      const content = await fsPromises.readFile(fullPath, 'utf8');
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const separatorIndex = trimmed.indexOf('=');
        if (separatorIndex === -1) continue;

        const key = trimmed.slice(0, separatorIndex).trim();
        let value = trimmed.slice(separatorIndex + 1).trim();

        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }

        setDefaultEnvVar(key, value);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }
}

async function readJsonBody(req, maxBytes = MAX_REQUEST_BODY_BYTES) {
  const rawBuffer = await new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let settled = false;
    let overflowed = false;

    const cleanup = () => {
      req.removeListener('data', onData);
      req.removeListener('end', onEnd);
      req.removeListener('error', onError);
      req.removeListener('aborted', onAborted);
      req.removeListener('close', onClose);
    };
    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const onData = (chunk) => {
      if (overflowed) return;
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        overflowed = true;
        chunks.length = 0;
        rejectOnce(createSecurityError('REQUEST_TOO_LARGE'));
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => {
      if (!settled) {
        settled = true;
        resolve(Buffer.concat(chunks));
      }
      cleanup();
    };
    const onError = (error) => {
      rejectOnce(error);
      cleanup();
    };
    const onAborted = () => {
      rejectOnce(createSecurityError('INVALID_REQUEST_BODY'));
    };
    const onClose = () => {
      if (!req.readableEnded) {
        rejectOnce(createSecurityError('INVALID_REQUEST_BODY'));
      }
      cleanup();
    };

    req.on('data', onData);
    req.once('end', onEnd);
    req.once('error', onError);
    req.once('aborted', onAborted);
    req.once('close', onClose);
    req.resume();
  });

  const raw = rawBuffer.toString('utf8');
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    throw createSecurityError('INVALID_REQUEST_BODY');
  }
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function normalizePathname(urlPath) {
  try {
    return decodeURIComponent(urlPath);
  } catch {
    return urlPath;
  }
}

async function serveStaticFile(res, rootDir, requestPath, { logger, requestId } = {}) {
  const normalizedPath = normalizePathname(requestPath);
  const relativePath = normalizedPath === '/' ? '/index.html' : normalizedPath;
  const safePath = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.resolve(rootDir, `.${safePath}`);

  if (!filePath.startsWith(path.resolve(rootDir))) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  try {
    const stat = await fsPromises.stat(filePath);
    const finalPath = stat.isDirectory() ? path.join(filePath, 'index.html') : filePath;
    const streamStat = stat.isDirectory() ? await fsPromises.stat(finalPath) : stat;
    const contentType = CONTENT_TYPES[path.extname(finalPath).toLowerCase()] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': streamStat.size
    });

    fs.createReadStream(finalPath).pipe(res);
  } catch (error) {
    if (error.code === 'ENOENT') {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }

    logOcrResult(logger, {
      requestId,
      status: 500,
      errorType: 'STATIC_FILE_ERROR'
    });
    sendJson(res, 500, { error: 'Failed to load resource' });
  }
}

function getRequestTokenSource(req) {
  return normalizeTokenSource(req.headers?.['x-ocr-token-source']);
}

function getSecurityHeaders(req) {
  const headers = { ...(req.headers || {}) };
  for (const name of ['authorization', 'content-type', 'content-length']) {
    const values = req.headersDistinct?.[name];
    if (Array.isArray(values) && values.length > 1) {
      headers[name] = values;
    }
  }
  return headers;
}

function logOcrResult(logger, fields) {
  try {
    logger?.log?.(fields);
  } catch {
    // Logging failures must not expose data or replace the HTTP response.
  }
}

function sendSecurityError(res, error) {
  const safeError = toSecurityResponse(error);
  sendJson(res, safeError.statusCode, safeError.payload);
  return safeError;
}

function handleHealthRequest(req, res) {
  if (req.method !== 'GET') {
    sendJson(res, 405, {
      ok: false,
      error: 'Method not allowed'
    });
    return;
  }

  sendJson(res, 200, {
    ok: true,
    service: 'kairos-finance'
  });
}

async function handleOcrRequest(req, res, {
  ocrService,
  env,
  logger,
  requestId,
  maxRequestBytes
}) {
  if (req.method !== 'POST') {
    const safeError = toSecurityResponse(createSecurityError('METHOD_NOT_ALLOWED'));
    logOcrResult(logger, {
      requestId,
      status: safeError.statusCode,
      errorType: safeError.payload.code,
      tokenSource: getRequestTokenSource(req),
      authResult: 'denied'
    });
    sendJson(res, safeError.statusCode, safeError.payload);
    return;
  }

  let auth = {
    tokenSource: getRequestTokenSource(req),
    authResult: 'denied'
  };
  let body;
  try {
    const securityHeaders = getSecurityHeaders(req);
    auth = authenticateOcrRequest({ headers: securityHeaders, env });
    assertJsonContentType(securityHeaders);
    assertContentLength(securityHeaders);
    body = await readJsonBody(req, maxRequestBytes);
    validateImageDataUrl(body?.image);
  } catch (error) {
    if (error instanceof OcrSecurityError) {
      const safeError = sendSecurityError(res, error);
      logOcrResult(logger, {
        requestId,
        status: safeError.statusCode,
        errorType: safeError.payload.code,
        tokenSource: auth.tokenSource,
        authResult: error.code === 'SECURITY_NOT_CONFIGURED'
          ? 'configuration_error'
          : auth.authResult
      });
      return;
    }

    const safeError = mapOcrServiceError(error);
    logOcrResult(logger, {
      requestId,
      status: safeError.statusCode,
      errorType: safeError.payload.code,
      tokenSource: auth.tokenSource,
      authResult: auth.authResult
    });
    sendJson(res, safeError.statusCode, safeError.payload);
    return;
  }

  try {
    const result = await ocrService({
      image: body.image,
      mode: body.mode || 'normal',
      request: req
    });
    sendJson(res, 200, result);
    logOcrResult(logger, {
      requestId,
      model: result?.meta?.model,
      latencyMs: result?.meta?.latencyMs,
      status: result?.status || 200,
      tokenSource: auth.tokenSource,
      authResult: auth.authResult
    });
  } catch (error) {
    const safeError = mapOcrServiceError(error);
    logOcrResult(logger, {
      requestId,
      status: safeError.statusCode,
      errorType: safeError.payload.code,
      tokenSource: auth.tokenSource,
      authResult: auth.authResult
    });
    sendJson(res, safeError.statusCode, safeError.payload);
  }
}

export function createAppServer({
  rootDir = __dirname,
  ocrService = recognizeInvoiceFromImage,
  env = process.env,
  logger = ocrLogger,
  requestIdFactory = createRequestId,
  maxRequestBytes = MAX_REQUEST_BODY_BYTES
} = {}) {
  return http.createServer(async (req, res) => {
    const requestId = requestIdFactory();
    const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');

    if (requestUrl.pathname === '/api/health' || requestUrl.pathname === '/health') {
      handleHealthRequest(req, res);
      return;
    }

    if (requestUrl.pathname === '/api/ocr') {
      await handleOcrRequest(req, res, {
        ocrService,
        env,
        logger,
        requestId,
        maxRequestBytes
      });
      return;
    }

    await serveStaticFile(res, rootDir, requestUrl.pathname, { logger, requestId });
  });
}

export function getStartupDisplayOrigin({
  host = '0.0.0.0',
  port = 3000
} = {}) {
  const displayHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
  return `http://${displayHost}:${port}`;
}

export async function startServer({
  rootDir = __dirname,
  port,
  host
} = {}) {
  await loadEnvFiles(rootDir);
  assertProductionSecurityConfig(process.env);

  const resolvedPort = port ?? (Number(process.env.PORT) || 3000);
  const resolvedHost = host ?? (process.env.HOST || '127.0.0.1');

  const server = createAppServer({ rootDir });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(resolvedPort, resolvedHost, resolve);
  });

  console.log(`Kairos Finance server listening on ${getStartupDisplayOrigin({
    host: resolvedHost,
    port: resolvedPort
  })}`);
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  startServer().catch((error) => {
    const errorType = /^[A-Z][A-Z0-9_]{0,63}$/u.test(error?.code || '')
      ? error.code
      : 'SERVER_STARTUP_ERROR';
    ocrLogger.log({ status: 'startup_failed', errorType });
    process.exit(1);
  });
}
