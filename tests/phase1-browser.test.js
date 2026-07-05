import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

async function loadOcrClient(overrides = {}) {
  const script = await fs.readFile(path.join(projectRoot, 'js/utils/ocrClient.js'), 'utf8');
  const window = overrides.window || {};
  const context = vm.createContext({
    console,
    window,
    fetch: overrides.fetch || (async () => ({ ok: true, json: async () => ({}) })),
    URL: overrides.URL || {
      createObjectURL: (file) => `blob:${file?.name || 'file'}`
    },
    AbortController,
    DOMException,
    File,
    Blob,
    setTimeout: overrides.setTimeout || setTimeout,
    clearTimeout: overrides.clearTimeout || clearTimeout
  });

  context.window = window;
  context.window.window = window;
  context.window.console = console;
  context.window.URL = context.URL;
  context.window.fetch = context.fetch;
  context.window.AbortController = AbortController;
  context.window.DOMException = DOMException;
  context.window.setTimeout = context.setTimeout;
  context.window.clearTimeout = context.clearTimeout;

  vm.runInContext(script, context);
  return context.window;
}

test('normal mode restores OCR cache before history or network', async () => {
  let historyCalls = 0;
  let fetchCalls = 0;
  const window = await loadOcrClient({
    fetch: async () => {
      fetchCalls += 1;
      throw new Error('network should not be called');
    },
    window: {
      convertPDFToImage: async (file) => file,
      processImage: async () => ({
        compressedBase64: 'data:image/jpeg;base64,abc',
        fileHash: 'hash-cache'
      }),
      storageRepo: {
        getCachedOcrResult: async () => ({
          result: {
            date: '2026-07-05',
            amount: 66.6,
            description: '缓存结果'
          }
        }),
        findRecordByHash: async () => {
          historyCalls += 1;
          return null;
        }
      }
    }
  });

  const file = new File(['demo'], 'invoice.jpg', { type: 'image/jpeg' });
  const item = await window.processInvoiceFile(
    file,
    false,
    { reimburser: 'Lin', project: 'Kairos' },
    { mode: 'normal' }
  );

  assert.equal(item.recognitionSource, 'cache');
  assert.equal(item.amount, 66.6);
  assert.equal(historyCalls, 0);
  assert.equal(fetchCalls, 0);
});

test('normal network request sends mode and caches returned model metadata', async () => {
  let requestBody;
  let savedCache;
  const window = await loadOcrClient({
    fetch: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          d: '2026-07-05',
          t: 120,
          s: '办公用品',
          meta: {
            model: 'primary-test-model',
            fallbackUsed: false,
            latencyMs: 100
          }
        })
      };
    },
    window: {
      convertPDFToImage: async (file) => file,
      processImage: async () => ({
        compressedBase64: 'data:image/jpeg;base64,abc',
        fileHash: 'hash-network'
      }),
      storageRepo: {
        getCachedOcrResult: async () => null,
        findRecordByHash: async () => null,
        saveCachedOcrResult: async (hash, result, meta) => {
          savedCache = { hash, result, meta };
        }
      }
    }
  });

  const file = new File(['demo'], 'invoice.jpg', { type: 'image/jpeg' });
  await window.processInvoiceFile(file, false, { reimburser: 'Lin', project: 'Kairos' });

  assert.deepEqual(requestBody, {
    image: 'data:image/jpeg;base64,abc',
    mode: 'normal'
  });
  assert.equal(savedCache.hash, 'hash-network');
  assert.equal(savedCache.result.amount, 120);
  assert.equal(savedCache.meta.modelVersion, 'primary-test-model');
});

test('high_accuracy bypasses local recovery and overwrites OCR cache', async () => {
  let cacheReads = 0;
  let historyReads = 0;
  let requestBody;
  let savedCache;
  const window = await loadOcrClient({
    fetch: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          d: '2026-07-05',
          t: 999,
          s: '增强识别结果',
          meta: {
            model: 'accuracy-test-model',
            fallbackUsed: false,
            latencyMs: 900
          }
        })
      };
    },
    window: {
      convertPDFToImage: async (file) => file,
      processImage: async () => ({
        compressedBase64: 'data:image/jpeg;base64,abc',
        fileHash: 'hash-high-accuracy'
      }),
      storageRepo: {
        getCachedOcrResult: async () => {
          cacheReads += 1;
          return { result: { amount: 10, description: '旧 OCR 缓存' } };
        },
        findRecordByHash: async () => {
          historyReads += 1;
          return { snapshot: { items: [{ amount: 20, description: '旧历史记录' }] } };
        },
        saveCachedOcrResult: async (hash, result, meta) => {
          savedCache = { hash, result, meta };
        }
      }
    }
  });

  const file = new File(['demo'], 'invoice.jpg', { type: 'image/jpeg' });
  const item = await window.processInvoiceFile(
    file,
    false,
    { reimburser: 'Lin', project: 'Kairos' },
    { mode: 'high_accuracy' }
  );

  assert.equal(cacheReads, 0);
  assert.equal(historyReads, 0);
  assert.equal(requestBody.mode, 'high_accuracy');
  assert.equal(item.amount, 999);
  assert.equal(savedCache.result.amount, 999);
  assert.equal(savedCache.meta.modelVersion, 'accuracy-test-model');
});

test('130 second timeout remains active while reading response JSON', async () => {
  let timer;
  let timeoutMs;
  const window = await loadOcrClient({
    setTimeout: (callback, delay) => {
      timeoutMs = delay;
      timer = { callback, cancelled: false };
      return timer;
    },
    clearTimeout: (timeout) => {
      timeout.cancelled = true;
    },
    fetch: async (_url, options) => ({
      ok: true,
      status: 200,
      json: async () => new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
        if (!timer.cancelled) timer.callback();
      })
    }),
    window: {
      convertPDFToImage: async (file) => file,
      processImage: async () => ({
        compressedBase64: 'data:image/jpeg;base64,abc',
        fileHash: 'hash-timeout'
      }),
      storageRepo: {
        getCachedOcrResult: async () => null,
        findRecordByHash: async () => null
      }
    }
  });

  const file = new File(['demo'], 'invoice.jpg', { type: 'image/jpeg' });
  const processing = window.processInvoiceFile(file, false, { reimburser: 'Lin', project: 'Kairos' });
  const guard = new Promise((resolve, reject) => {
    setTimeout(() => reject(new Error('response body timeout guard expired')), 50);
  });

  await assert.rejects(
    Promise.race([processing, guard]),
    (error) => error?.name === 'AbortError'
  );
  assert.equal(timeoutMs, 130000);
});

test('external abort listener is removed after processing', async () => {
  let addedListener;
  let removedListener;
  const externalSignal = {
    aborted: false,
    addEventListener(type, listener) {
      assert.equal(type, 'abort');
      addedListener = listener;
    },
    removeEventListener(type, listener) {
      assert.equal(type, 'abort');
      removedListener = listener;
    }
  };
  const window = await loadOcrClient({
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        d: '2026-07-05',
        t: 100,
        s: '测试',
        meta: { model: 'primary-test-model' }
      })
    }),
    window: {
      convertPDFToImage: async (file) => file,
      processImage: async () => ({
        compressedBase64: 'data:image/jpeg;base64,abc',
        fileHash: 'hash-listener'
      }),
      storageRepo: {
        getCachedOcrResult: async () => null,
        findRecordByHash: async () => null,
        saveCachedOcrResult: async () => {}
      }
    }
  });

  const file = new File(['demo'], 'invoice.jpg', { type: 'image/jpeg' });
  await window.processInvoiceFile(
    file,
    false,
    { reimburser: 'Lin', project: 'Kairos' },
    { signal: externalSignal }
  );

  assert.equal(typeof addedListener, 'function');
  assert.equal(removedListener, addedListener);
});
