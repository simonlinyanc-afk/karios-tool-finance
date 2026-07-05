import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), '..');

async function read(relativePath) {
  return fs.readFile(path.join(projectRoot, relativePath), 'utf8');
}

test('production environment example binds locally and contains only a credential placeholder', async () => {
  const source = await read('.env.production.example');
  assert.match(source, /^NODE_ENV=production$/mu);
  assert.match(source, /^HOST=127\.0\.0\.1$/mu);
  assert.match(source, /^OCR_ACCESS_TOKEN=replace-with-a-long-random-internal-value$/mu);
  assert.doesNotMatch(source, /OCR_ACCESS_TOKEN=(?!replace-with-)[^\r\n]+/u);
});

test('Nginx example protects the site and injects auth from an external secret snippet', async () => {
  const [source, deployment] = await Promise.all([
    read('deploy/nginx-yellow-bird-finance.conf'),
    read('docs/deployment-self-hosted.md')
  ]);
  assert.match(source, /listen 443 ssl/u);
  assert.match(source, /auth_basic\s+"[^"]+"/u);
  assert.match(source, /client_max_body_size 15m/u);
  assert.match(source, /location = \/api\/ocr/u);
  assert.match(source, /include \/etc\/nginx\/snippets\/yellow-bird-finance-ocr-auth\.conf/u);
  assert.match(source, /proxy_set_header X-OCR-Token-Source "nginx"/u);
  assert.match(source, /proxy_read_timeout 150s/u);
  assert.match(source, /limit_req/u);
  assert.match(source, /127\.0\.0\.1:3000/u);
  assert.doesNotMatch(source, /proxy_set_header Authorization\s+"Bearer\s+[^$<]/u);
  assert.match(
    deployment,
    /proxy_set_header Authorization "Bearer <OCR_ACCESS_TOKEN>";/u
  );
  assert.doesNotMatch(
    deployment,
    /proxy_set_header Authorization "Bearer (?!<OCR_ACCESS_TOKEN>)[^"]+";/u
  );
});

test('security and deployment docs record the approved hybrid boundary', async () => {
  const [security, deployment] = await Promise.all([
    read('docs/security.md'),
    read('docs/deployment-self-hosted.md')
  ]);
  for (const required of [
    'sessionStorage',
    'Nginx',
    '15 MiB',
    'tokenSource',
    'authResult',
    '不记录'
  ]) {
    assert.match(security, new RegExp(required, 'u'));
  }
  for (const required of [
    '127.0.0.1',
    '外置',
    '整站',
    'Phase 6',
    'Docker',
    '回滚'
  ]) {
    assert.match(deployment, new RegExp(required, 'u'));
  }
});

test('Q-001 is resolved as the approved hybrid authentication plan', async () => {
  const source = await read('docs/open-questions.md');
  const q001 = source.split('## Q-002')[0];
  assert.match(q001, /状态：已解决/u);
  assert.match(q001, /Nginx/u);
  assert.match(q001, /sessionStorage/u);
  assert.doesNotMatch(q001, /状态：开放/u);
});

test('self-hosted server has no raw error-object console logging path', async () => {
  const source = await read('server.js');
  assert.doesNotMatch(source, /console\.error\([^\n]*\berror\b/u);
});
