import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import { QWEN_OCR_PROMPT } from '../api/ocr-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

async function loadClassicScript(relativePath, overrides = {}) {
  const script = await fs.readFile(path.join(projectRoot, relativePath), 'utf8');
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
    clearTimeout: overrides.clearTimeout || clearTimeout,
    SparkMD5: overrides.SparkMD5,
    Worker: overrides.Worker,
    pdfjsLib: overrides.pdfjsLib,
    document: overrides.document,
    FileReader: overrides.FileReader
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
  return { context, window: context.window };
}

test('QWEN OCR prompt requests compact short-key JSON payload', () => {
  assert.match(QWEN_OCR_PROMPT, /"d"/);
  assert.match(QWEN_OCR_PROMPT, /"t"/);
  assert.match(QWEN_OCR_PROMPT, /"x"/);
  assert.doesNotMatch(QWEN_OCR_PROMPT, /"date": "YYYY-MM-DD"/);
});

test('normalizeInvoiceItem backfills runtime fields for legacy records', async () => {
  const { window } = await loadClassicScript('js/utils/ocrClient.js');

  const normalized = window.normalizeInvoiceItem({
    id: 1,
    date: '2026-04-01',
    amount: 128.5,
    description: '员工聚餐'
  });

  assert.equal(normalized.status, 'ready');
  assert.equal(normalized.recognitionSource, 'manual');
  assert.deepEqual(Array.from(normalized.warningFlags), []);
  assert.equal(normalized.lastError, '');
  assert.equal(typeof normalized.createdAt, 'number');
  assert.equal(typeof normalized.updatedAt, 'number');
});

test('processOCRResponse normalizes mixed short-key and long-key payloads', async () => {
  const { window } = await loadClassicScript('js/utils/ocrClient.js');
  const file = new File(['demo'], 'invoice.jpg', { type: 'image/jpeg' });

  const item = window.processOCRResponse(
    {
      d: '2026-04-01',
      t: 188.88,
      x: 10.88,
      s: '餐饮美食 - 员工聚餐',
      c: '餐饮美食',
      n: 'NO123',
      buyerName: 'Kairos',
      sellerName: 'Cafe'
    },
    file,
    false,
    'blob:preview',
    { reimburser: 'Lin', project: 'Kairos' },
    0,
    'hash-1'
  );

  assert.equal(item.status, 'ready');
  assert.equal(item.recognitionSource, 'ocr');
  assert.deepEqual(Array.from(item.warningFlags), []);
  assert.equal(item.invoiceNumber, 'NO123');
  assert.equal(item.buyerName, 'Kairos');
  assert.equal(item.amount, 188.88);
});

test('analyzeInvoiceImage prefers ocrCache over history fallback and network', async () => {
  let historyCalls = 0;
  let fetchCalls = 0;

  const { window } = await loadClassicScript('js/utils/ocrClient.js', {
    fetch: async () => {
      fetchCalls++;
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
            date: '2026-04-01',
            amount: 66.6,
            description: '缓存结果'
          }
        }),
        findRecordByHash: async () => {
          historyCalls++;
          return null;
        }
      }
    }
  });

  const file = new File(['demo'], 'invoice.jpg', { type: 'image/jpeg' });
  const item = await window.analyzeInvoiceImage(file, false, { reimburser: 'Lin', project: 'Kairos' });

  assert.equal(item.recognitionSource, 'cache');
  assert.equal(item.status, 'ready');
  assert.equal(historyCalls, 0);
  assert.equal(fetchCalls, 0);
});

test('network OCR defaults to normal mode and caches the service model metadata', async () => {
  let fetchRequest;
  let savedCache;
  let requestTimeoutMs;
  const { window } = await loadClassicScript('js/utils/ocrClient.js', {
    fetch: async (url, options) => {
      fetchRequest = { url, options };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          d: '2026-07-05',
          t: 120,
          s: '办公用品 - 打印耗材',
          meta: {
            model: 'primary-test-model',
            fallbackUsed: false,
            latencyMs: 1500
          }
        })
      };
    },
    setTimeout: (_callback, delay) => {
      requestTimeoutMs = delay;
      return 1;
    },
    clearTimeout: () => {},
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
  const item = await window.processInvoiceFile(
    file,
    false,
    { reimburser: 'Lin', project: 'Kairos' }
  );

  assert.equal(fetchRequest.url, '/api/ocr');
  assert.deepEqual(JSON.parse(fetchRequest.options.body), {
    image: 'data:image/jpeg;base64,abc',
    mode: 'normal'
  });
  assert.equal(requestTimeoutMs, 130000);
  assert.equal(item.amount, 120);
  assert.equal(savedCache.hash, 'hash-network');
  assert.equal(savedCache.meta.modelVersion, 'primary-test-model');
  assert.equal(savedCache.meta.promptVersion, 'v2-short-keys');
});

test('network OCR preserves an explicit high_accuracy mode', async () => {
  let requestBody;
  const { window } = await loadClassicScript('js/utils/ocrClient.js', {
    fetch: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          d: '2026-07-05',
          t: 200,
          s: '服务费',
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
        fileHash: 'hash-accuracy'
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
    { mode: 'high_accuracy' }
  );

  assert.equal(requestBody.mode, 'high_accuracy');
});

test('high_accuracy mode bypasses local recovery and overwrites OCR cache', async () => {
  let cacheReads = 0;
  let historyReads = 0;
  let requestBody;
  let savedCache;
  const { window } = await loadClassicScript('js/utils/ocrClient.js', {
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
          return {
            result: {
              date: '2026-01-01',
              amount: 10,
              description: '旧 OCR 缓存'
            }
          };
        },
        findRecordByHash: async () => {
          historyReads += 1;
          return {
            snapshot: {
              items: [{ amount: 20, description: '旧历史记录' }]
            }
          };
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
  assert.equal(savedCache.hash, 'hash-high-accuracy');
  assert.equal(savedCache.result.amount, 999);
  assert.equal(savedCache.meta.modelVersion, 'accuracy-test-model');
});

test('OCR timeout remains active while reading the response body', async () => {
  let timer;
  let requestTimeoutMs;
  const { window } = await loadClassicScript('js/utils/ocrClient.js', {
    setTimeout: (callback, delay) => {
      requestTimeoutMs = delay;
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
  const processing = window.processInvoiceFile(
    file,
    false,
    { reimburser: 'Lin', project: 'Kairos' }
  );
  const guard = new Promise((resolve, reject) => {
    setTimeout(() => reject(new Error('response body timeout guard expired')), 50);
  });

  await assert.rejects(
    Promise.race([processing, guard]),
    (error) => error?.name === 'AbortError'
  );
  assert.equal(requestTimeoutMs, 130000);
});

test('processInvoiceFile removes the external abort listener after completion', async () => {
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
  const { window } = await loadClassicScript('js/utils/ocrClient.js', {
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

test('getImageProcessingProfile exposes lighter defaults and second pass settings', async () => {
  const { window } = await loadClassicScript('js/utils/imageProcessor.js', {
    Worker: function Worker() {},
    FileReader: class {}
  });

  const imageProfile = window.getImageProcessingProfile(false);
  const pdfProfile = window.getImageProcessingProfile(true);

  assert.equal(imageProfile.maxDim, 1280);
  assert.equal(imageProfile.quality, 0.65);
  assert.equal(imageProfile.secondPass.maxDim, 1080);
  assert.equal(imageProfile.secondPass.quality, 0.55);
  assert.equal(pdfProfile.maxDim, 1440);
});

test('getExportReadiness summarizes warning rows for review panel', async () => {
  const { window } = await loadClassicScript('js/utils/ocrClient.js');

  const readiness = window.getExportReadiness([
    window.normalizeInvoiceItem({
      id: 1,
      date: '2026-04-01',
      amount: 120,
      description: '午餐',
      category: '餐饮美食'
    }),
    window.normalizeInvoiceItem({
      id: 2,
      date: '',
      amount: 88,
      description: '',
      category: '其他'
    }),
    window.normalizeInvoiceItem({
      id: 3,
      date: '',
      amount: 0,
      description: '识别失败',
      category: '其他'
    }, {
      status: 'failed',
      recognitionSource: 'ocr',
      lastError: 'OCR timeout',
      preserveOcrFailure: true
    })
  ]);

  assert.equal(readiness.total, 3);
  assert.equal(readiness.readyCount, 1);
  assert.equal(readiness.needsReviewCount, 1);
  assert.equal(readiness.failedCount, 1);
  assert.equal(readiness.hasBlockingIssues, true);
  assert.equal(readiness.warningCounts.missing_date, 2);
  assert.equal(readiness.warningCounts.missing_description, 1);
  assert.equal(readiness.warningCounts.ocr_failed, 1);
  assert.equal(readiness.issues[0].rowLabel, '第 2 行');
  assert.match(readiness.issues[0].summary, /缺少日期/);
});

test('UI scripts keep header logo-only and remove the table exception panel copy', async () => {
  const headerScript = await fs.readFile(path.join(projectRoot, 'js/components/AppHeader.js'), 'utf8');
  const tableScript = await fs.readFile(path.join(projectRoot, 'js/components/ReimbursementTable.js'), 'utf8');

  assert.doesNotMatch(headerScript, /LOCAL-FIRST REIMBURSEMENT WORKSPACE/);
  assert.doesNotMatch(headerScript, /Kairos Finance·黄鸟报销单系统/);
  assert.doesNotMatch(tableScript, /异常总面板/);
  assert.doesNotMatch(tableScript, /系统已自动汇总需要补充的条目/);
});

test('export preview uses a collapsible checklist drawer instead of inline detail rows', async () => {
  const exportPreviewScript = await fs.readFile(path.join(projectRoot, 'js/components/ExportPreviewModal.js'), 'utf8');

  assert.match(exportPreviewScript, /showCheckDetails/);
  assert.match(exportPreviewScript, /展开检查清单/);
  assert.match(exportPreviewScript, /检查清单/);
  assert.doesNotMatch(exportPreviewScript, /系统已经帮你筛出异常项，可以继续导出，也可以先补齐。/);
});

test('export preview registers every custom icon it renders', async () => {
  const exportPreviewScript = await fs.readFile(path.join(projectRoot, 'js/components/ExportPreviewModal.js'), 'utf8');
  const iconsScript = await fs.readFile(path.join(projectRoot, 'js/components/icons.js'), 'utf8');
  const iconListMatch = exportPreviewScript.match(/const\s+\{\s*([^}]+)\s*\}\s*=\s*window;/);

  assert.ok(iconListMatch, 'ExportPreviewModal should destructure icons from window');

  const referencedIcons = iconListMatch[1]
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);

  for (const iconName of referencedIcons) {
    assert.match(
      iconsScript,
      new RegExp(`window\\.${iconName}\\s*=`),
      `Expected ${iconName} to be registered in icons.js`
    );
  }
});
