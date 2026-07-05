export const CANONICAL_INVOICE_FIELDS = Object.freeze([
  'date',
  'invoiceNumber',
  'buyerName',
  'sellerName',
  'category',
  'itemName',
  'specification',
  'unit',
  'quantity',
  'unitPrice',
  'amount',
  'taxRate',
  'tax',
  'subtotal',
  'totalWithTax',
  'remarks',
  'description'
]);

const NUMERIC_FIELDS = new Set([
  'quantity',
  'unitPrice',
  'amount',
  'tax',
  'subtotal',
  'totalWithTax'
]);

const MONEY_FIELDS = new Set(['amount', 'tax', 'subtotal', 'totalWithTax']);
const NORMALIZED_INVOICE = Symbol('normalizedInvoice');
const INVALID_NUMERIC_FIELDS = Symbol('invalidNumericFields');
const INVALID_INVOICE_NUMBER = Symbol('invalidInvoiceNumber');
const AMOUNT_TOLERANCE = 0.02;

const FIELD_ALIASES = Object.freeze({
  date: ['date', 'd'],
  invoiceNumber: ['invoiceNumber', 'invoiceNo', 'n'],
  buyerName: ['buyerName', 'buyer', 'b'],
  sellerName: ['sellerName', 'seller', 'm'],
  category: ['category', 'c'],
  itemName: ['itemName', 'i'],
  specification: ['specification', 'g'],
  unit: ['unit', 'u'],
  quantity: ['quantity', 'q'],
  unitPrice: ['unitPrice', 'p'],
  amount: ['amount', 't'],
  taxRate: ['taxRate', 'r'],
  tax: ['tax', 'x'],
  subtotal: ['subtotal', 'y'],
  totalWithTax: ['totalWithTax', 'total', 'w'],
  remarks: ['remarks', 'k'],
  description: ['description', 'summary', 's']
});

export class InvoiceResponseError extends Error {
  constructor() {
    super('Qwen response did not contain a readable invoice object');
    this.name = 'InvoiceResponseError';
    this.code = 'OCR_RESPONSE_ERROR';
    this.canFallback = true;
  }
}

export function createEmptyInvoice() {
  return Object.fromEntries(CANONICAL_INVOICE_FIELDS.map(field => [
    field,
    NUMERIC_FIELDS.has(field) ? null : ''
  ]));
}

function firstDefinedValue(value, aliases) {
  for (const alias of aliases) {
    if (Object.hasOwn(value, alias) && value[alias] !== undefined && value[alias] !== null) {
      return value[alias];
    }
  }
  return undefined;
}

function normalizeDate(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';

  const match = text.match(/^(\d{4})\s*(?:[-/.]|\u5e74)\s*(\d{1,2})\s*(?:[-/.]|\u6708)\s*(\d{1,2})\s*(?:\u65e5)?$/u);
  if (!match) return text;

  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}

function normalizeNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const text = String(value ?? '')
    .trim()
    .replace(/[\s,\uffe5¥]/gu, '');
  if (!text || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/u.test(text)) return null;

  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function shiftDecimal(value, places) {
  const [coefficient, exponent = '0'] = String(value).toLowerCase().split('e');
  return Number(`${coefficient}e${Number(exponent) + places}`);
}

function roundMoney(value) {
  const sign = value < 0 ? -1 : 1;
  const shifted = shiftDecimal(Math.abs(value), 2);
  if (!Number.isFinite(shifted)) return value;
  return sign * shiftDecimal(Math.round(shifted), -2);
}

function normalizeString(value) {
  return String(value ?? '').trim();
}

export function normalizeInvoiceObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new InvoiceResponseError();
  }

  const invoice = createEmptyInvoice();
  const invalidNumericFields = new Set(value[INVALID_NUMERIC_FIELDS] || []);
  let invalidInvoiceNumber = value[INVALID_INVOICE_NUMBER] === true;
  for (const field of CANONICAL_INVOICE_FIELDS) {
    const rawValue = firstDefinedValue(value, FIELD_ALIASES[field]);
    if (field === 'date') {
      invoice[field] = normalizeDate(rawValue);
    } else if (field === 'invoiceNumber') {
      const scalarInvoiceNumber = typeof rawValue === 'string'
        || (typeof rawValue === 'number' && Number.isFinite(rawValue));
      if (rawValue === undefined || rawValue === null) {
        invoice[field] = '';
      } else if (scalarInvoiceNumber) {
        invoice[field] = normalizeString(rawValue).replace(/\s+/gu, '');
      } else {
        invalidInvoiceNumber = true;
        invoice[field] = '';
      }
    } else if (NUMERIC_FIELDS.has(field)) {
      const normalizedNumber = normalizeNumber(rawValue);
      const hasUnreadableValue = rawValue !== undefined
        && rawValue !== null
        && String(rawValue).trim() !== ''
        && normalizedNumber === null;
      if (hasUnreadableValue) invalidNumericFields.add(field);
      invoice[field] = normalizedNumber !== null && MONEY_FIELDS.has(field)
        ? roundMoney(normalizedNumber)
        : normalizedNumber;
    } else {
      invoice[field] = normalizeString(rawValue);
    }
  }


  const amountCanFill = Number(invoice.amount) > 0 && !invalidNumericFields.has('amount');
  const totalCanFill = Number(invoice.totalWithTax) > 0 && !invalidNumericFields.has('totalWithTax');
  const amountMayBeCompleted = (invoice.amount === null || invoice.amount === 0)
    && !invalidNumericFields.has('amount');
  const totalMayBeCompleted = (invoice.totalWithTax === null || invoice.totalWithTax === 0)
    && !invalidNumericFields.has('totalWithTax');
  if (totalMayBeCompleted && amountCanFill) {
    invoice.totalWithTax = invoice.amount;
  } else if (amountMayBeCompleted && totalCanFill) {
    invoice.amount = invoice.totalWithTax;
  }

  if (
    invoice.subtotal === null
    && !invalidNumericFields.has('subtotal')
    && Number.isFinite(invoice.totalWithTax)
    && Number.isFinite(invoice.tax)
    && invoice.totalWithTax >= invoice.tax
  ) {
    invoice.subtotal = roundMoney(invoice.totalWithTax - invoice.tax);
  }

  Object.defineProperties(invoice, {
    [NORMALIZED_INVOICE]: { value: true },
    [INVALID_NUMERIC_FIELDS]: { value: invalidNumericFields },
    [INVALID_INVOICE_NUMBER]: { value: invalidInvoiceNumber }
  });

  return invoice;
}

function getModelText(payload) {
  const content = payload?.output?.choices?.[0]?.message?.content;
  if (!Array.isArray(content) || content.length === 0) throw new InvoiceResponseError();

  for (const part of content) {
    if (typeof part === 'string' && part.trim()) return part;
    if (typeof part?.text === 'string' && part.text.trim()) return part.text;
  }
  throw new InvoiceResponseError();
}

function parseObjectText(text) {
  const trimmed = text.trim();

  try {
    const exact = JSON.parse(trimmed);
    if (!exact || typeof exact !== 'object' || Array.isArray(exact)) {
      throw new InvoiceResponseError();
    }
    return exact;
  } catch (error) {
    if (error instanceof InvoiceResponseError) throw error;
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) throw new InvoiceResponseError();

  try {
    const extracted = JSON.parse(trimmed.slice(start, end + 1));
    if (!extracted || typeof extracted !== 'object' || Array.isArray(extracted)) {
      throw new InvoiceResponseError();
    }
    return extracted;
  } catch {
    throw new InvoiceResponseError();
  }
}

export function extractInvoiceModelObject(payload) {
  return parseObjectText(getModelText(payload));
}

export function parseInvoiceModelPayload(payload) {
  return normalizeInvoiceObject(extractInvoiceModelObject(payload));
}

const WARNING_DEFINITIONS = Object.freeze({
  unreadable_response: { field: null, message: '暂时没有识别成功' },
  missing_date: { field: 'date', message: '发票日期缺失' },
  invalid_date: { field: 'date', message: '发票日期需要确认' },
  missing_invoice_number: { field: 'invoiceNumber', message: '发票号码缺失' },
  invalid_invoice_number: { field: 'invoiceNumber', message: '发票号码需要确认' },
  missing_amount: { field: 'amount', message: '发票金额缺失' },
  invalid_amount: { field: 'amount', message: '发票金额需要确认' },
  invalid_tax: { field: 'tax', message: '税额需要确认' },
  amount_total_mismatch: { field: 'totalWithTax', message: '金额与价税合计不一致' },
  subtotal_tax_mismatch: { field: 'subtotal', message: '金额与税额关系需要确认' }
});

function createWarning(code) {
  return { code, ...WARNING_DEFINITIONS[code] };
}

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function isValidCalendarDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;

  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

export function validateInvoiceData(data) {
  const warnings = [];
  const invalidNumericFields = data[INVALID_NUMERIC_FIELDS] || new Set();

  if (!data.date) {
    warnings.push(createWarning('missing_date'));
  } else if (!isValidCalendarDate(data.date)) {
    warnings.push(createWarning('invalid_date'));
  }

  if (data[INVALID_INVOICE_NUMBER] === true) {
    warnings.push(createWarning('invalid_invoice_number'));
  } else if (!data.invoiceNumber) {
    warnings.push(createWarning('missing_invoice_number'));
  } else if (data.invoiceNumber.length < 4 || data.invoiceNumber.length > 64) {
    warnings.push(createWarning('invalid_invoice_number'));
  }

  const amountInvalid = invalidNumericFields.has('amount')
    || invalidNumericFields.has('totalWithTax')
    || (data.amount !== null && data.amount < 0)
    || (data.totalWithTax !== null && data.totalWithTax < 0);
  const hasFinalAmount = Number(data.amount) > 0 || Number(data.totalWithTax) > 0;
  if (amountInvalid) {
    warnings.push(createWarning('invalid_amount'));
  } else if (!hasFinalAmount) {
    warnings.push(createWarning('missing_amount'));
  }

  const effectiveTotal = Number(data.totalWithTax) > 0
    ? data.totalWithTax
    : data.amount;
  const taxForRelationship = data.tax === null ? 0 : data.tax;
  const taxInvalid = invalidNumericFields.has('tax')
    || (data.tax !== null && data.tax < 0)
    || (Number.isFinite(effectiveTotal) && data.tax > effectiveTotal);
  if (taxInvalid) {
    warnings.push(createWarning('invalid_tax'));
  }

  if (
    Number(data.amount) > 0
    && Number(data.totalWithTax) > 0
    && Math.abs(data.amount - data.totalWithTax) > AMOUNT_TOLERANCE + Number.EPSILON
  ) {
    warnings.push(createWarning('amount_total_mismatch'));
  }

  const subtotalInvalid = invalidNumericFields.has('subtotal')
    || (data.subtotal !== null && data.subtotal < 0);
  if (subtotalInvalid || (
    !taxInvalid
    && Number.isFinite(data.subtotal)
    && Number.isFinite(taxForRelationship)
    && Number(effectiveTotal) > 0
    && Math.abs(data.subtotal + taxForRelationship - effectiveTotal) > AMOUNT_TOLERANCE + Number.EPSILON
  )) {
    warnings.push(createWarning('subtotal_tax_mismatch'));
  }

  return warnings;
}

export function evaluateInvoice(value) {
  const data = normalizeInvoiceObject(value);
  const warnings = validateInvoiceData(data);

  return {
    status: warnings.length === 0 ? 'ready' : 'needs_review',
    data,
    warnings
  };
}

export function shouldRecheckInvoice(value) {
  return evaluateInvoice(value).status !== 'ready';
}

export function createFailedInvoiceResult(meta = {}) {
  return {
    status: 'failed',
    data: createEmptyInvoice(),
    warnings: [createWarning('unreadable_response')],
    meta
  };
}
