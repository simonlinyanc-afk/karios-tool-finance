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
    URL: overrides.URL || { createObjectURL: (file) => `blob:${file?.name || 'file'}` },
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

function readyData(overrides = {}) {
  return {
    date: '2026-07-06',
    invoiceNumber: 'INV-12345678',
    amount: 106,
    tax: 6,
    subtotal: 100,
    totalWithTax: 106,
    description: '办公用品',
    ...overrides
  };
}

function reimbursementInfo() {
  return { reimburser: 'Lin', project: 'Kairos' };
}

test('unwrapOcrResponse separates the formal envelope from technical metadata', async () => {
  const window = await loadOcrClient();
  const result = window.unwrapOcrResponse({
    status: 'needs_review',
    data: readyData({ date: '' }),
    warnings: [{ code: 'missing_date', field: 'date', message: '发票日期缺失' }],
    meta: { model: 'review-test-model', fallbackUsed: true, latencyMs: 250 }
  });

  assert.equal(result.data.invoiceNumber, 'INV-12345678');
  assert.equal(result.status, 'needs_review');
  assert.deepEqual(Array.from(result.warningFlags), ['missing_date']);
  assert.deepEqual({ ...result.recognitionMeta }, {
    model: 'review-test-model',
    fallbackUsed: true,
    latencyMs: 250
  });
  assert.equal(Object.hasOwn(result.data, 'meta'), false);
});

test('processOCRResponse preserves service status and warning codes using Chinese labels', async () => {
  const window = await loadOcrClient();
  const file = new File(['demo'], 'invoice.jpg', { type: 'image/jpeg' });
  const item = window.processOCRResponse({
    status: 'needs_review',
    data: readyData({ date: '2026-02-30' }),
    warnings: [{ code: 'invalid_date', field: 'date', message: '发票日期需要确认' }],
    meta: { model: 'review-test-model', fallbackUsed: true, latencyMs: 250 }
  }, file, false, 'blob:preview', reimbursementInfo(), 0, 'hash-review');

  assert.equal(item.status, 'needs_review');
  assert.equal(item.warningFlags.includes('invalid_date'), true);
  assert.equal(item.recognitionMeta.model, 'review-test-model');
  assert.equal(item.recognitionMeta.fallbackUsed, true);
  assert.equal(window.getIssueSummary(item).includes('发票日期需要确认'), true);
  assert.doesNotMatch(window.getIssueSummary(item), /fallback|schema|json|model|md5|indexeddb|dashscope/i);
  assert.doesNotMatch(item.description, /review-test-model|fallback/i);
});

test('a failed envelope creates a failed row instead of a ready row', async () => {
  const window = await loadOcrClient();
  const file = new File(['demo'], 'invoice.jpg', { type: 'image/jpeg' });
  const item = window.processOCRResponse({
    status: 'failed',
    data: {},
    warnings: [{ code: 'unreadable_response', field: null, message: '暂时没有识别成功' }],
    meta: { model: 'review-test-model', fallbackUsed: true, latencyMs: 400 }
  }, file, false, 'blob:preview', reimbursementInfo(), 0, 'hash-failed');

  assert.equal(item.status, 'failed');
  assert.equal(item.warningFlags.includes('unreadable_response'), true);
  assert.equal(window.getIssueSummary(item).includes('暂时没有识别成功'), true);
});

test('legacy root-level OCR responses remain compatible', async () => {
  const window = await loadOcrClient();
  const file = new File(['demo'], 'invoice.jpg', { type: 'image/jpeg' });
  const item = window.processOCRResponse({
    d: '2026-07-06',
    n: 'LEGACY-001',
    t: 88,
    s: '旧响应',
    meta: { model: 'legacy-test-model', fallbackUsed: false, latencyMs: 10 }
  }, file, false, 'blob:preview', reimbursementInfo(), 0, 'hash-legacy');

  assert.equal(item.status, 'ready');
  assert.equal(item.invoiceNumber, 'LEGACY-001');
  assert.equal(item.amount, 88);
  assert.equal(item.recognitionMeta.model, 'legacy-test-model');
});

test('OCR cache saves and restores status warnings and internal recognition metadata', async () => {
  let cachedResult = null;
  let fetchCalls = 0;
  const window = await loadOcrClient({
    fetch: async () => {
      fetchCalls += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: 'needs_review',
          data: readyData({ invoiceNumber: '' }),
          warnings: [{
            code: 'missing_invoice_number',
            field: 'invoiceNumber',
            message: '发票号码缺失'
          }],
          meta: { model: 'review-test-model', fallbackUsed: true, latencyMs: 320 }
        })
      };
    },
    window: {
      convertPDFToImage: async (file) => file,
      processImage: async () => ({
        compressedBase64: 'data:image/jpeg;base64,abc',
        fileHash: 'hash-cache-state'
      }),
      storageRepo: {
        getCachedOcrResult: async () => cachedResult ? { result: cachedResult } : null,
        findRecordByHash: async () => null,
        saveCachedOcrResult: async (_hash, result) => {
          cachedResult = result;
        }
      }
    }
  });

  const file = new File(['demo'], 'invoice.jpg', { type: 'image/jpeg' });
  const networkItem = await window.processInvoiceFile(file, false, reimbursementInfo());
  assert.equal(networkItem.status, 'needs_review');
  assert.equal(cachedResult.status, 'needs_review');
  assert.deepEqual(Array.from(cachedResult.warningFlags), ['missing_invoice_number']);
  assert.equal(cachedResult.recognitionMeta.model, 'review-test-model');

  const cachedItem = await window.processInvoiceFile(file, false, reimbursementInfo());
  assert.equal(fetchCalls, 1);
  assert.equal(cachedItem.recognitionSource, 'cache');
  assert.equal(cachedItem.status, 'needs_review');
  assert.equal(cachedItem.warningFlags.includes('missing_invoice_number'), true);
  assert.equal(cachedItem.recognitionMeta.fallbackUsed, true);
});

test('legacy cache records without Phase 2 state still derive a usable status', async () => {
  let fetchCalls = 0;
  const window = await loadOcrClient({
    fetch: async () => {
      fetchCalls += 1;
      throw new Error('network should not run');
    },
    window: {
      convertPDFToImage: async (file) => file,
      processImage: async () => ({
        compressedBase64: 'data:image/jpeg;base64,abc',
        fileHash: 'hash-old-cache'
      }),
      storageRepo: {
        getCachedOcrResult: async () => ({
          result: {
            date: '2026-07-06',
            invoiceNumber: 'OLD-001',
            amount: 66,
            description: '旧缓存'
          }
        }),
        findRecordByHash: async () => null
      }
    }
  });

  const file = new File(['demo'], 'invoice.jpg', { type: 'image/jpeg' });
  const item = await window.processInvoiceFile(file, false, reimbursementInfo());
  assert.equal(item.status, 'ready');
  assert.equal(item.recognitionSource, 'cache');
  assert.equal(item.amount, 66);
  assert.equal(fetchCalls, 0);
});

test('unknown warning codes never leak raw engineering labels to users', async () => {
  const window = await loadOcrClient();
  assert.equal(window.getWarningLabel('internal_schema_error'), '建议检查');
});

test('manual correction removes stale known warnings and returns valid rows to ready', async () => {
  const window = await loadOcrClient();
  const valid = readyData();
  const cases = [
    {
      warning: 'invalid_date',
      invalid: { date: '2026-02-30' },
      corrected: { date: valid.date }
    },
    {
      warning: 'missing_invoice_number',
      invalid: { invoiceNumber: '' },
      corrected: { invoiceNumber: valid.invoiceNumber }
    },
    {
      warning: 'invalid_invoice_number',
      invalid: { invoiceNumber: '12' },
      corrected: { invoiceNumber: valid.invoiceNumber }
    },
    {
      warning: 'missing_amount',
      invalid: { amount: 0, totalWithTax: 0 },
      corrected: { amount: valid.amount, totalWithTax: valid.totalWithTax }
    },
    {
      warning: 'invalid_amount',
      invalid: { amount: -1, totalWithTax: valid.totalWithTax },
      corrected: { amount: valid.amount, totalWithTax: valid.totalWithTax }
    }
  ];

  for (const testCase of cases) {
    const corrected = window.normalizeInvoiceItem({
      ...valid,
      ...testCase.invalid,
      ...testCase.corrected,
      status: 'needs_review',
      warningFlags: [testCase.warning]
    }, { recognitionSource: 'manual' });

    assert.equal(corrected.warningFlags.includes(testCase.warning), false, testCase.warning);
    assert.equal(corrected.status, 'ready', testCase.warning);
  }
});

test('manual edits to unrelated fields retain warnings that are still valid', async () => {
  const window = await loadOcrClient();
  const item = window.normalizeInvoiceItem({
    ...readyData({ date: '2026-02-30' }),
    status: 'needs_review',
    warningFlags: ['invalid_date'],
    remarks: '用户只修改了备注'
  }, { recognitionSource: 'manual' });

  assert.equal(item.status, 'needs_review');
  assert.equal(item.warningFlags.includes('invalid_date'), true);
  assert.equal(window.getIssueSummary(item).includes('发票日期需要确认'), true);
});
