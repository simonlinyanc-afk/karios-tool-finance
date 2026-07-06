import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Readable } from 'node:stream';

import { createAppServer } from '../server.js';

function dispatch(server, {
  method = 'GET',
  url = '/api/health',
  body = ''
} = {}) {
  const chunks = body ? [Buffer.from(body)] : [];
  const req = Readable.from(chunks);
  req.method = method;
  req.url = url;
  req.headers = {};

  return new Promise((resolve, reject) => {
    req.once('error', reject);
    server.emit('request', req, {
      statusCode: 200,
      headers: {},
      writeHead(statusCode, headers = {}) {
        this.statusCode = statusCode;
        this.headers = headers;
      },
      end(payload = '') {
        resolve({
          statusCode: this.statusCode,
          headers: this.headers,
          payload: payload ? JSON.parse(String(payload)) : undefined
        });
      }
    });
  });
}

test('GET /api/health returns a safe minimal status payload', async () => {
  const server = createAppServer({
    env: {
      NODE_ENV: 'production',
      OCR_ACCESS_TOKEN: 'phase6-health-secret-32-characters'
    }
  });

  const response = await dispatch(server);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.payload, {
    ok: true,
    service: 'kairos-finance'
  });
  assert.doesNotMatch(JSON.stringify(response.payload), /phase6-health-secret|QWEN|API|KEY|TOKEN/u);
});

test('health endpoint only allows GET and keeps the legacy path compatible', async () => {
  const server = createAppServer();

  const legacy = await dispatch(server, { url: '/health' });
  const wrongMethod = await dispatch(server, { method: 'POST' });

  assert.equal(legacy.statusCode, 200);
  assert.deepEqual(legacy.payload, {
    ok: true,
    service: 'kairos-finance'
  });
  assert.equal(wrongMethod.statusCode, 405);
  assert.deepEqual(wrongMethod.payload, {
    ok: false,
    error: 'Method not allowed'
  });
});

test('Docker and Nginx deployment examples preserve the approved self-hosted boundary', async () => {
  const [dockerfile, dockerignore, compose, nginx, docs] = await Promise.all([
    fs.readFile('Dockerfile', 'utf8'),
    fs.readFile('.dockerignore', 'utf8'),
    fs.readFile('docker-compose.yml', 'utf8'),
    fs.readFile('deploy/nginx-yellow-bird-finance.conf', 'utf8'),
    fs.readFile('docs/deployment-self-hosted.md', 'utf8')
  ]);

  assert.match(dockerfile, /FROM node:20-alpine/u);
  assert.match(dockerfile, /USER node/u);
  assert.match(dockerfile, /\/api\/health/u);
  assert.doesNotMatch(dockerfile, /QWEN_API_KEY|OCR_ACCESS_TOKEN=.*[A-Za-z0-9]/u);
  assert.match(dockerignore, /^\.env$/mu);
  assert.match(dockerignore, /^\.env\.\*$/mu);
  assert.match(dockerignore, /^!\.env\.production\.example$/mu);

  assert.match(compose, /127\.0\.0\.1:3000:3000/u);
  assert.match(compose, /env_file:\s*\n\s*- \.env\.production/u);
  assert.match(compose, /\/api\/health/u);
  assert.doesNotMatch(compose, /QWEN_API_KEY|OCR_ACCESS_TOKEN=.*[A-Za-z0-9]/u);

  assert.match(nginx, /client_max_body_size 15m/u);
  assert.match(nginx, /limit_req_zone/u);
  assert.match(nginx, /proxy_read_timeout 150s/u);
  assert.match(nginx, /yellow-bird-finance-ocr-auth\.conf/u);
  assert.match(nginx, /location = \/api\/health/u);
  assert.doesNotMatch(nginx, /Bearer\s+sk-|OCR_ACCESS_TOKEN=.*[A-Za-z0-9]/u);

  for (const requiredCopy of [
    'Docker Compose',
    'OCR_ACCESS_TOKEN',
    '回滚',
    '日志',
    '/api/health'
  ]) {
    assert.match(docs, new RegExp(requiredCopy, 'u'));
  }
});
