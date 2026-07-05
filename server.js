import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { mapOcrServiceError, recognizeInvoiceFromImage } from './api/ocr-service.js';

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

async function readJsonBody(req, maxBytes = 15 * 1024 * 1024) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > maxBytes) {
      const error = new Error('Request body too large');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error('Invalid JSON body');
    error.statusCode = 400;
    throw error;
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

async function serveStaticFile(res, rootDir, requestPath) {
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

    console.error('Static file error:', error);
    sendJson(res, 500, { error: 'Failed to load resource' });
  }
}

async function handleOcrRequest(req, res, ocrService) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    if (error.statusCode === 400 || error.statusCode === 413) {
      sendJson(res, error.statusCode, { error: error.message });
      return;
    }

    const safeError = mapOcrServiceError(error);
    console.error('Self-hosted OCR error', {
      code: safeError.payload.code,
      statusCode: safeError.statusCode
    });
    sendJson(res, safeError.statusCode, safeError.payload);
    return;
  }

  if (!body.image) {
    sendJson(res, 400, { error: 'Missing image data' });
    return;
  }

  try {
    const result = await ocrService({
      image: body.image,
      mode: body.mode || 'normal',
      request: req
    });
    sendJson(res, 200, result);
  } catch (error) {
    const safeError = mapOcrServiceError(error);
    console.error('Self-hosted OCR error', {
      code: safeError.payload.code,
      statusCode: safeError.statusCode
    });
    sendJson(res, safeError.statusCode, safeError.payload);
  }
}

export function createAppServer({
  rootDir = __dirname,
  ocrService = recognizeInvoiceFromImage
} = {}) {
  return http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');

    if (requestUrl.pathname === '/health') {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (requestUrl.pathname === '/api/ocr') {
      await handleOcrRequest(req, res, ocrService);
      return;
    }

    await serveStaticFile(res, rootDir, requestUrl.pathname);
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
  port = Number(process.env.PORT) || 3000,
  host = process.env.HOST || '0.0.0.0'
} = {}) {
  await loadEnvFiles(rootDir);

  const server = createAppServer({ rootDir });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });

  console.log(`Kairos Finance server listening on ${getStartupDisplayOrigin({ host, port })}`);
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  startServer().catch((error) => {
    console.error('Failed to start self-hosted server:', error);
    process.exit(1);
  });
}
