import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const VALID_IMAGE = 'data:image/jpeg;base64,Zm9v';

function createSessionStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(String(key), String(value));
    },
    removeItem(key) {
      values.delete(String(key));
    },
    entries() {
      return Array.from(values.entries());
    }
  };
}

async function loadOcrClient({ fetch, prompt, sessionStorage } = {}) {
  const script = await fs.readFile(path.join(projectRoot, 'js/utils/ocrClient.js'), 'utf8');
  const window = {
    convertPDFToImage: async (file) => file,
    processImage: async () => ({ compressedBase64: VALID_IMAGE, fileHash: 'phase3-hash' }),
    processOCRResponse: undefined,
    storageRepo: {
      getCachedOcrResult: async () => null,
      findRecordByHash: async () => null,
      saveCachedOcrResult: async () => {}
    },
    sessionStorage: sessionStorage || createSessionStorage(),
    prompt: prompt || (() => null)
  };
  const context = vm.createContext({
    console,
    window,
    fetch,
    URL: { createObjectURL: (file) => `blob:${file?.name || 'file'}` },
    AbortController,
    DOMException,
    File,
    Blob,
    setTimeout,
    clearTimeout
  });
  context.window.window = window;
  context.window.URL = context.URL;
  context.window.fetch = fetch;
  context.window.AbortController = AbortController;
  context.window.DOMException = DOMException;
  context.window.setTimeout = setTimeout;
  context.window.clearTimeout = clearTimeout;
  vm.runInContext(script, context);
  return window;
}

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  };
}

function successPayload() {
  return {
    status: 'ready',
    data: {
      date: '2026-07-06',
      invoiceNumber: 'INV-SECURITY',
      amount: 10,
      tax: 0,
      subtotal: 10,
      totalWithTax: 10,
      description: '安全测试'
    },
    warnings: [],
    meta: {}
  };
}

async function process(window) {
  return window.processInvoiceFile(
    new File(['demo'], 'invoice.jpg', { type: 'image/jpeg' }),
    false,
    { reimburser: 'Lin', project: 'Kairos' }
  );
}

test('a credential already in sessionStorage is sent only in request headers', async () => {
  const storage = createSessionStorage({ 'kairos.ocr.accessCredential': 'session-secret' });
  const requests = [];
  const window = await loadOcrClient({
    sessionStorage: storage,
    prompt: () => assert.fail('prompt must not open'),
    fetch: async (_url, options) => {
      requests.push(options);
      return response(200, successPayload());
    }
  });

  await process(window);

  assert.equal(requests.length, 1);
  assert.equal(requests[0].headers.Authorization, 'Bearer session-secret');
  assert.equal(requests[0].headers['X-OCR-Token-Source'], 'session');
  assert.doesNotMatch(requests[0].body, /session-secret/u);
});

test('a 403 prompts once stores only in sessionStorage and retries once', async () => {
  const storage = createSessionStorage();
  const requests = [];
  const prompts = [];
  const window = await loadOcrClient({
    sessionStorage: storage,
    prompt: (message) => {
      prompts.push(message);
      return ' entered-secret ';
    },
    fetch: async (_url, options) => {
      requests.push(options);
      return requests.length === 1
        ? response(403, { error: '访问凭证无效', action: '请重新输入访问凭证，然后再次识别。' })
        : response(200, successPayload());
    }
  });

  const item = await process(window);

  assert.equal(item.status, 'ready');
  assert.equal(prompts.length, 1);
  assert.match(prompts[0], /访问凭证/u);
  assert.doesNotMatch(prompts[0], /Bearer|Token|JSON|model|IndexedDB|DashScope/u);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].headers.Authorization, undefined);
  assert.equal(requests[1].headers.Authorization, 'Bearer entered-secret');
  assert.deepEqual(storage.entries(), [['kairos.ocr.accessCredential', 'entered-secret']]);
});

test('a second 403 clears the session credential and gives the next action', async () => {
  const storage = createSessionStorage({ 'kairos.ocr.accessCredential': 'old-secret' });
  let calls = 0;
  const window = await loadOcrClient({
    sessionStorage: storage,
    prompt: () => 'new-secret',
    fetch: async () => {
      calls += 1;
      return response(403, {
        error: '访问凭证无效，请重新输入后再试。',
        action: '请重新输入访问凭证，然后再次识别。'
      });
    }
  });

  await assert.rejects(
    process(window),
    (error) => {
      assert.match(error.message, /访问凭证/u);
      assert.match(error.message, /重新输入/u);
      assert.doesNotMatch(error.message, /Bearer|Token|JSON|model|IndexedDB|DashScope/u);
      return true;
    }
  );
  assert.equal(calls, 2);
  assert.deepEqual(storage.entries(), []);
});

test('cancelling credential input does not retry and explains what to do', async () => {
  const storage = createSessionStorage();
  let calls = 0;
  const window = await loadOcrClient({
    sessionStorage: storage,
    prompt: () => '   ',
    fetch: async () => {
      calls += 1;
      return response(403, { error: '访问受限' });
    }
  });

  await assert.rejects(
    process(window),
    (error) => /输入访问凭证后重新识别/u.test(error.message)
  );
  assert.equal(calls, 1);
  assert.deepEqual(storage.entries(), []);
});

test('non-403 errors prefer the safe server message and action without prompting', async () => {
  let promptCalls = 0;
  const window = await loadOcrClient({
    prompt: () => {
      promptCalls += 1;
      return 'unused';
    },
    fetch: async () => response(413, {
      error: '图片数据超过大小限制。',
      action: '请压缩图片或拆分文件后重新上传。',
      details: 'unsafe details should not win'
    })
  });

  await assert.rejects(
    process(window),
    (error) => error.message === '图片数据超过大小限制。 请压缩图片或拆分文件后重新上传。'
  );
  assert.equal(promptCalls, 0);
});

test('session privacy restrictions use an accurate actionable message without retrying', async () => {
  let calls = 0;
  const sessionStorage = {
    getItem: () => null,
    setItem: () => { throw new Error('storage denied'); },
    removeItem() {}
  };
  const window = await loadOcrClient({
    sessionStorage,
    prompt: () => 'entered-secret',
    fetch: async () => {
      calls += 1;
      return response(403, { error: '访问受限' });
    }
  });

  await assert.rejects(
    process(window),
    (error) => {
      assert.match(error.message, /浏览器隐私设置/u);
      assert.match(error.message, /联系管理员/u);
      assert.doesNotMatch(error.message, /尚未输入|sessionStorage|Token|JSON|IndexedDB/u);
      return true;
    }
  );
  assert.equal(calls, 1);
});

test('browser auth implementation never references persistent storage APIs', async () => {
  const source = await fs.readFile(path.join(projectRoot, 'js/utils/ocrClient.js'), 'utf8');
  assert.match(source, /sessionStorage/u);
  assert.doesNotMatch(source, /localStorage/u);
  assert.doesNotMatch(source, /indexedDB/u);
});
