import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CANONICAL_INVOICE_FIELDS,
  InvoiceResponseError,
  createEmptyInvoice,
  createFailedInvoiceResult,
  evaluateInvoice,
  normalizeInvoiceObject,
  parseInvoiceModelPayload,
  shouldRecheckInvoice,
  validateInvoiceData
} from '../api/invoice-schema.js';

function createPayload(text) {
  return {
    output: {
      choices: [{
        message: {
          content: [{ text }]
        }
      }]
    }
  };
}

test('parseInvoiceModelPayload maps short and compatible aliases to canonical fields', () => {
  const parsed = parseInvoiceModelPayload(createPayload(JSON.stringify({
    d: '2026/7/6',
    n: ' 1234 5678 ',
    buyer: 'Kairos',
    m: '供应商',
    t: '￥1,060.00',
    x: '60',
    y: '1000',
    total: '1060',
    summary: '办公用品'
  })));

  assert.equal(parsed.date, '2026-07-06');
  assert.equal(parsed.invoiceNumber, '12345678');
  assert.equal(parsed.buyerName, 'Kairos');
  assert.equal(parsed.sellerName, '供应商');
  assert.equal(parsed.amount, 1060);
  assert.equal(parsed.tax, 60);
  assert.equal(parsed.subtotal, 1000);
  assert.equal(parsed.totalWithTax, 1060);
  assert.equal(parsed.description, '办公用品');
});

test('normalizeInvoiceObject prefers canonical keys over compatible and short aliases', () => {
  const parsed = normalizeInvoiceObject({
    invoiceNumber: 'CANONICAL',
    invoiceNo: 'COMPATIBLE',
    n: 'SHORT',
    buyerName: '规范购买方',
    buyer: '兼容购买方',
    b: '短键购买方',
    totalWithTax: 120,
    total: 110,
    w: 100
  });

  assert.equal(parsed.invoiceNumber, 'CANONICAL');
  assert.equal(parsed.buyerName, '规范购买方');
  assert.equal(parsed.totalWithTax, 120);
});

test('parseInvoiceModelPayload extracts an object from code fences and surrounding text', () => {
  const parsed = parseInvoiceModelPayload(createPayload(
    '识别结果如下\n```json\n{"date":"2026.7.6","invoiceNo":"INV-001","amount":88}\n```\n请核对'
  ));

  assert.equal(parsed.date, '2026-07-06');
  assert.equal(parsed.invoiceNumber, 'INV-001');
  assert.equal(parsed.amount, 88);
});

test('parseInvoiceModelPayload accepts string content parts from DashScope payloads', () => {
  const payload = {
    output: {
      choices: [{ message: { content: ['{"d":"2026年7月6日","n":"INV-002","t":66}'] } }]
    }
  };

  const parsed = parseInvoiceModelPayload(payload);
  assert.equal(parsed.date, '2026-07-06');
  assert.equal(parsed.invoiceNumber, 'INV-002');
  assert.equal(parsed.amount, 66);
});

test('parseInvoiceModelPayload rejects unreadable, array, and malformed model output safely', () => {
  for (const text of [
    '没有可读发票数据',
    '[{"d":"2026-07-06"}]',
    '{"d":"2026-07-06"'
  ]) {
    assert.throws(
      () => parseInvoiceModelPayload(createPayload(text)),
      (error) => {
        assert.equal(error instanceof InvoiceResponseError, true);
        assert.equal(error.code, 'OCR_RESPONSE_ERROR');
        assert.equal(error.canFallback, true);
        assert.equal(Object.hasOwn(error, 'rawResponse'), false);
        assert.doesNotMatch(error.message, /2026-07-06/);
        return true;
      }
    );
  }
});

test('createEmptyInvoice exposes every canonical field with stable default types', () => {
  const invoice = createEmptyInvoice();

  assert.deepEqual(Object.keys(invoice), CANONICAL_INVOICE_FIELDS);
  for (const field of CANONICAL_INVOICE_FIELDS) {
    if (['quantity', 'unitPrice', 'amount', 'tax', 'subtotal', 'totalWithTax'].includes(field)) {
      assert.equal(invoice[field], null);
    } else {
      assert.equal(invoice[field], '');
    }
  }
});

function completeInvoice(overrides = {}) {
  return {
    date: '2026-07-06',
    invoiceNumber: 'INV-12345678',
    amount: 106,
    tax: 6,
    subtotal: 100,
    totalWithTax: 106,
    ...overrides
  };
}

test('validateInvoiceData distinguishes missing and impossible calendar dates', () => {
  const missingWarnings = validateInvoiceData(normalizeInvoiceObject(completeInvoice({ date: '' })));
  assert.deepEqual(
    missingWarnings.filter(warning => warning.field === 'date'),
    [{ code: 'missing_date', field: 'date', message: '发票日期缺失' }]
  );

  const invalidWarnings = validateInvoiceData(normalizeInvoiceObject(completeInvoice({ date: '2026-02-30' })));
  assert.deepEqual(
    invalidWarnings.filter(warning => warning.field === 'date'),
    [{ code: 'invalid_date', field: 'date', message: '发票日期需要确认' }]
  );
});

test('validateInvoiceData distinguishes missing and clearly abnormal invoice numbers', () => {
  const missingWarnings = validateInvoiceData(normalizeInvoiceObject(completeInvoice({ invoiceNumber: '' })));
  assert.deepEqual(
    missingWarnings.filter(warning => warning.field === 'invoiceNumber'),
    [{ code: 'missing_invoice_number', field: 'invoiceNumber', message: '发票号码缺失' }]
  );

  for (const invoiceNumber of ['12', 'A'.repeat(65)]) {
    const warnings = validateInvoiceData(normalizeInvoiceObject(completeInvoice({ invoiceNumber })));
    assert.deepEqual(
      warnings.filter(warning => warning.field === 'invoiceNumber'),
      [{ code: 'invalid_invoice_number', field: 'invoiceNumber', message: '发票号码需要确认' }]
    );
  }
});

test('evaluateInvoice rejects non-scalar invoice numbers without exposing internal markers', () => {
  for (const invoiceNumber of [
    { value: 'OBJECT-LIKE' },
    ['ARRAY-LIKE'],
    true
  ]) {
    const first = evaluateInvoice(completeInvoice({ invoiceNumber }));
    assert.equal(first.status, 'needs_review');
    assert.equal(
      first.warnings.some(warning => warning.code === 'invalid_invoice_number'),
      true
    );
    assert.equal(first.data.invoiceNumber, '');
    assert.doesNotMatch(JSON.stringify(first.data), /object Object|ARRAY-LIKE|invalidInvoice/i);

    const repeated = evaluateInvoice(first.data);
    assert.equal(repeated.status, 'needs_review');
    assert.equal(
      repeated.warnings.some(warning => warning.code === 'invalid_invoice_number'),
      true
    );
  }
});

test('evaluateInvoice and shouldRecheckInvoice reflect date and invoice number warnings', () => {
  const ready = evaluateInvoice(completeInvoice());
  assert.equal(ready.status, 'ready');
  assert.deepEqual(ready.warnings, []);
  assert.equal(shouldRecheckInvoice(ready.data), false);

  const review = evaluateInvoice(completeInvoice({ date: '2026-02-30' }));
  assert.equal(review.status, 'needs_review');
  assert.equal(review.warnings.some(warning => warning.code === 'invalid_date'), true);
  assert.equal(shouldRecheckInvoice(review.data), true);
});

test('evaluateInvoice warns when amount and total differ beyond two-cent tolerance', () => {
  const tolerated = evaluateInvoice(completeInvoice({ amount: 106, totalWithTax: 106.02 }));
  assert.equal(tolerated.warnings.some(warning => warning.code === 'amount_total_mismatch'), false);

  const mismatched = evaluateInvoice(completeInvoice({ amount: 106, totalWithTax: 106.03 }));
  assert.deepEqual(
    mismatched.warnings.filter(warning => warning.code === 'amount_total_mismatch'),
    [{ code: 'amount_total_mismatch', field: 'totalWithTax', message: '金额与价税合计不一致' }]
  );
});

test('evaluateInvoice warns when subtotal plus tax differs from total beyond tolerance', () => {
  const tolerated = evaluateInvoice(completeInvoice({
    subtotal: 100,
    tax: 6,
    totalWithTax: 106.02,
    amount: 106.02
  }));
  assert.equal(tolerated.warnings.some(warning => warning.code === 'subtotal_tax_mismatch'), false);

  const mismatched = evaluateInvoice(completeInvoice({ subtotal: 90, tax: 6 }));
  assert.deepEqual(
    mismatched.warnings.filter(warning => warning.code === 'subtotal_tax_mismatch'),
    [{ code: 'subtotal_tax_mismatch', field: 'subtotal', message: '金额与税额关系需要确认' }]
  );
});

test('evaluateInvoice distinguishes missing and invalid final amounts', () => {
  for (const value of [undefined, '', 0]) {
    const review = evaluateInvoice(completeInvoice({ amount: value, totalWithTax: value }));
    assert.equal(review.warnings.some(warning => warning.code === 'missing_amount'), true);
  }

  for (const value of ['not-a-number', -1]) {
    const review = evaluateInvoice(completeInvoice({ amount: value, totalWithTax: value }));
    assert.deepEqual(
      review.warnings.filter(warning => warning.code === 'invalid_amount'),
      [{ code: 'invalid_amount', field: 'amount', message: '发票金额需要确认' }]
    );
  }
});

test('evaluateInvoice preserves an explicit negative total beside a valid positive total', () => {
  for (const values of [
    { amount: -1, totalWithTax: 106, invalidField: 'amount' },
    { amount: 106, totalWithTax: -1, invalidField: 'totalWithTax' }
  ]) {
    const result = evaluateInvoice(completeInvoice(values));

    assert.equal(result.status, 'needs_review');
    assert.equal(result.warnings.some(warning => warning.code === 'invalid_amount'), true);
    assert.equal(result.data[values.invalidField], -1);
  }
});

test('evaluateInvoice warns for invalid tax values', () => {
  for (const tax of ['not-a-number', -1, 107]) {
    const review = evaluateInvoice(completeInvoice({ tax }));
    assert.deepEqual(
      review.warnings.filter(warning => warning.code === 'invalid_tax'),
      [{ code: 'invalid_tax', field: 'tax', message: '税额需要确认' }]
    );
  }
});

test('evaluateInvoice treats a missing tax as zero when checking subtotal relationships', () => {
  for (const tax of [null, undefined]) {
    const review = evaluateInvoice(completeInvoice({
      amount: 106,
      totalWithTax: 106,
      subtotal: 100,
      tax
    }));
    assert.equal(review.status, 'needs_review');
    assert.equal(
      review.warnings.some(warning => warning.code === 'subtotal_tax_mismatch'),
      true
    );
  }

  const taxExempt = evaluateInvoice(completeInvoice({
    amount: 106,
    totalWithTax: 106,
    subtotal: 106,
    tax: null
  }));
  assert.equal(taxExempt.status, 'ready');
  assert.deepEqual(taxExempt.warnings, []);
});

test('normalizeInvoiceObject conservatively completes final amount and subtotal', () => {
  const fromAmount = evaluateInvoice(completeInvoice({ totalWithTax: undefined })).data;
  assert.equal(fromAmount.amount, 106);
  assert.equal(fromAmount.totalWithTax, 106);

  const fromTotal = evaluateInvoice(completeInvoice({ amount: undefined })).data;
  assert.equal(fromTotal.amount, 106);
  assert.equal(fromTotal.totalWithTax, 106);

  const withDerivedSubtotal = evaluateInvoice(completeInvoice({ subtotal: undefined })).data;
  assert.equal(withDerivedSubtotal.subtotal, 100);
});

test('normalizeInvoiceObject rounds monetary values without overwriting conflicting totals', () => {
  const result = evaluateInvoice(completeInvoice({
    amount: '￥1,060.005',
    totalWithTax: '1,060.10',
    tax: '60.004',
    subtotal: '1,000.001'
  })).data;

  assert.equal(result.amount, 1060.01);
  assert.equal(result.totalWithTax, 1060.1);
  assert.equal(result.tax, 60);
  assert.equal(result.subtotal, 1000);
});

test('normalizeInvoiceObject uses reliable financial rounding at decimal boundaries', () => {
  for (const [input, expected] of [
    [10.075, 10.08],
    [1.005, 1.01],
    [100.335, 100.34]
  ]) {
    const result = normalizeInvoiceObject({
      amount: input,
      totalWithTax: input,
      tax: 0,
      subtotal: input
    });
    assert.equal(result.amount, expected, String(input));
    assert.equal(result.totalWithTax, expected, String(input));
    assert.equal(result.subtotal, expected, String(input));
  }
});

test('createFailedInvoiceResult returns a stable failed envelope without raw output', () => {
  const meta = { model: 'review-test-model', fallbackUsed: true, latencyMs: 25 };
  const result = createFailedInvoiceResult(meta);

  assert.equal(result.status, 'failed');
  assert.deepEqual(result.data, createEmptyInvoice());
  assert.deepEqual(result.warnings, [{
    code: 'unreadable_response',
    field: null,
    message: '暂时没有识别成功'
  }]);
  assert.equal(result.meta, meta);
  assert.doesNotMatch(JSON.stringify(result.warnings), /schema|json|model|dashscope/i);
});
