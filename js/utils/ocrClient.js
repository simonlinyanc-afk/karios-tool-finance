// OCR Client Utilities
// Unified Architecture: single OCR orchestrator for batch and single-item uploads.

const OCR_PROMPT_VERSION = 'v2-short-keys';
const OCR_ACCESS_CREDENTIAL_SESSION_KEY = 'kairos.ocr.accessCredential';

const SHORT_KEY_MAP = {
    date: ['date', 'd'],
    invoiceNumber: ['invoiceNumber', 'n'],
    buyerName: ['buyerName', 'b'],
    sellerName: ['sellerName', 'm'],
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
    totalWithTax: ['totalWithTax', 'w'],
    remarks: ['remarks', 'k'],
    description: ['description', 's']
};

const CACHEABLE_FIELDS = [
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
];

const WARNING_FLAG_LABELS = {
    unreadable_response: '暂时没有识别成功',
    missing_date: '缺少日期',
    invalid_date: '发票日期需要确认',
    missing_invoice_number: '发票号码缺失',
    invalid_invoice_number: '发票号码需要确认',
    missing_amount: '缺少金额',
    invalid_amount: '发票金额需要确认',
    invalid_tax: '税额需要确认',
    amount_total_mismatch: '金额与价税合计不一致',
    subtotal_tax_mismatch: '金额与税额关系需要确认',
    missing_description: '缺少摘要说明',
    ocr_failed: '识别失败'
};

const RECOGNITION_STATUSES = new Set(['ready', 'needs_review', 'failed']);
const REVALIDATABLE_WARNING_FLAGS = new Set([
    'unreadable_response',
    'missing_date',
    'invalid_date',
    'missing_invoice_number',
    'invalid_invoice_number',
    'missing_amount',
    'invalid_amount',
    'invalid_tax',
    'amount_total_mismatch',
    'subtotal_tax_mismatch',
    'missing_description',
    'ocr_failed'
]);
const LOCAL_AMOUNT_TOLERANCE = 0.02;

function getValue(data, key) {
    const aliases = SHORT_KEY_MAP[key] || [key];
    for (const alias of aliases) {
        if (data && data[alias] !== undefined) return data[alias];
    }
    return '';
}

function getNumberValue(data, key) {
    const value = getValue(data, key);
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function getSessionAccessCredential() {
    try {
        return String(window.sessionStorage?.getItem(OCR_ACCESS_CREDENTIAL_SESSION_KEY) || '').trim();
    } catch {
        return '';
    }
}

function saveSessionAccessCredential(value) {
    const credential = String(value || '').trim();
    if (!credential) return '';
    try {
        window.sessionStorage?.setItem(OCR_ACCESS_CREDENTIAL_SESSION_KEY, credential);
    } catch {
        return '';
    }
    return credential;
}

function clearSessionAccessCredential() {
    try {
        window.sessionStorage?.removeItem(OCR_ACCESS_CREDENTIAL_SESSION_KEY);
    } catch {
        // The request can still fail safely when browser storage is unavailable.
    }
}

function buildOcrRequestHeaders(credential) {
    const headers = { 'Content-Type': 'application/json' };
    if (credential) {
        headers.Authorization = `Bearer ${credential}`;
        headers['X-OCR-Token-Source'] = 'session';
    }
    return headers;
}

function createOcrRequestError(payload, status) {
    const errorText = typeof payload?.error === 'string' && payload.error.trim()
        ? payload.error.trim()
        : `识别服务暂时无法处理请求（${status}）。`;
    const actionText = typeof payload?.action === 'string' && payload.action.trim()
        ? payload.action.trim()
        : '请稍后重新识别；如果仍然失败，请手动填写。';
    return new Error(`${errorText} ${actionText}`);
}

function getUserFacingRecognitionError(error) {
    const message = String(error?.message || '');
    if (/PDF Conversion|PDF/i.test(message)) {
        return '这个 PDF 暂时无法读取。请将发票页面截图后上传。';
    }
    if (/too large|size limit|超过大小|文件过大|图片数据超过/u.test(message)) {
        return '文件过大，暂时无法处理。请重新导出较小的 PDF，或将发票截图后再上传。';
    }
    if (/timeout|timed out|超时|时间过长/u.test(message)) {
        return '识别时间过长，系统已停止等待。请重新识别，或使用增强识别再试一次。';
    }
    if (/访问凭证|访问未通过|访问受限/u.test(message)) {
        return '当前访问未通过验证。请确认你正在使用工作室内部提供的正确入口。';
    }
    if (/服务设置|服务配置|暂时不可用/u.test(message)) {
        return '识别服务暂时不可用。请联系维护人员检查服务设置。';
    }
    return '这张发票暂时没有识别成功。请重新识别、使用增强识别，或手动填写关键信息。';
}

function normalizeWarningFlags(flags) {
    return Array.from(new Set((flags || []).filter(Boolean)));
}

function getWarningCodes(warnings) {
    if (!Array.isArray(warnings)) return [];
    return normalizeWarningFlags(warnings.map(warning => {
        if (typeof warning === 'string') return warning;
        return typeof warning?.code === 'string' ? warning.code : '';
    }));
}

function normalizeRecognitionMeta(meta) {
    const normalized = {};
    if (typeof meta?.model === 'string' && meta.model.trim()) {
        normalized.model = meta.model.trim();
    }
    if (typeof meta?.fallbackUsed === 'boolean') {
        normalized.fallbackUsed = meta.fallbackUsed;
    }
    if (Number.isFinite(Number(meta?.latencyMs)) && Number(meta.latencyMs) >= 0) {
        normalized.latencyMs = Math.round(Number(meta.latencyMs));
    }
    return normalized;
}

function unwrapOcrResponse(response = {}) {
    const isObject = response && typeof response === 'object' && !Array.isArray(response);
    const isEnvelope = isObject
        && response.data
        && typeof response.data === 'object'
        && !Array.isArray(response.data)
        && RECOGNITION_STATUSES.has(response.status);
    const data = isEnvelope ? response.data : (isObject ? response : {});
    const status = RECOGNITION_STATUSES.has(response.status) ? response.status : undefined;
    const warningFlags = isEnvelope
        ? getWarningCodes(response.warnings)
        : normalizeWarningFlags(response.warningFlags || getWarningCodes(response.warnings));
    const recognitionMeta = normalizeRecognitionMeta(
        isEnvelope ? response.meta : (response.recognitionMeta || response.meta)
    );

    return { data, status, warningFlags, recognitionMeta };
}

function getWarningFlagsFromItem(item, { preserveOcrFailure = false } = {}) {
    const flags = [];

    if (!item.date) flags.push('missing_date');
    if (!(Number(item.amount) > 0)) flags.push('missing_amount');
    if (!String(item.description || '').trim()) flags.push('missing_description');
    if (preserveOcrFailure) flags.push('ocr_failed');

    return normalizeWarningFlags(flags);
}

function isValidLocalCalendarDate(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/u);
    if (!match) return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1) return false;
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return day <= days[month - 1];
}

function getRevalidatedWarningFlags(item) {
    const flags = [];
    if (!item.date) {
        flags.push('missing_date');
    } else if (!isValidLocalCalendarDate(item.date)) {
        flags.push('invalid_date');
    }

    const invoiceNumber = String(item.invoiceNumber || '').replace(/\s+/gu, '');
    if (!invoiceNumber) {
        flags.push('missing_invoice_number');
    } else if (invoiceNumber.length < 4 || invoiceNumber.length > 64) {
        flags.push('invalid_invoice_number');
    }

    const amount = Number(item.amount);
    const total = Number(item.totalWithTax);
    const invalidAmount = !Number.isFinite(amount)
        || !Number.isFinite(total)
        || amount < 0
        || total < 0;
    if (invalidAmount) {
        flags.push('invalid_amount');
    } else if (!(amount > 0 || total > 0)) {
        flags.push('missing_amount');
    }
    if (
        amount > 0
        && total > 0
        && Math.abs(amount - total) > LOCAL_AMOUNT_TOLERANCE + Number.EPSILON
    ) {
        flags.push('amount_total_mismatch');
    }

    const effectiveTotal = total > 0 ? total : amount;
    const tax = Number(item.tax);
    const invalidTax = !Number.isFinite(tax)
        || tax < 0
        || (Number.isFinite(effectiveTotal) && tax > effectiveTotal);
    if (invalidTax) flags.push('invalid_tax');

    const subtotal = Number(item.subtotal);
    if (
        !Number.isFinite(subtotal)
        || subtotal < 0
        || (!invalidTax
            && effectiveTotal > 0
            && Math.abs(subtotal + tax - effectiveTotal) > LOCAL_AMOUNT_TOLERANCE + Number.EPSILON)
    ) {
        flags.push('subtotal_tax_mismatch');
    }

    if (!String(item.description || '').trim()) flags.push('missing_description');
    return normalizeWarningFlags(flags);
}

function determineItemStatus(item, warningFlags, explicitStatus) {
    if (explicitStatus) return explicitStatus;
    if (item.status === 'processing') return 'processing';
    if (warningFlags.includes('ocr_failed')) return 'failed';
    if (warningFlags.length > 0) return 'needs_review';
    return 'ready';
}

function getWarningLabel(flag) {
    return WARNING_FLAG_LABELS[flag] || '建议检查';
}

function getIssueSummary(item) {
    const warningFlags = normalizeWarningFlags(item.warningFlags);
    if (warningFlags.length === 0) return '已就绪';
    return warningFlags.map(getWarningLabel).join('、');
}

function getExportReadiness(items = []) {
    const normalizedItems = Array.isArray(items) ? items.map(item => normalizeInvoiceItem(item, {
        recognitionSource: item?.recognitionSource || 'manual'
    })) : [];

    const warningCounts = {
        unreadable_response: 0,
        missing_date: 0,
        invalid_date: 0,
        missing_invoice_number: 0,
        invalid_invoice_number: 0,
        missing_amount: 0,
        invalid_amount: 0,
        invalid_tax: 0,
        amount_total_mismatch: 0,
        subtotal_tax_mismatch: 0,
        missing_description: 0,
        ocr_failed: 0
    };

    const issues = [];
    let readyCount = 0;
    let needsReviewCount = 0;
    let failedCount = 0;

    normalizedItems.forEach((item, index) => {
        const flags = normalizeWarningFlags(item.warningFlags);

        if (item.status === 'failed') {
            failedCount++;
        } else if (item.status === 'needs_review') {
            needsReviewCount++;
        } else if (item.status === 'ready') {
            readyCount++;
        }

        flags.forEach(flag => {
            if (warningCounts[flag] !== undefined) {
                warningCounts[flag] += 1;
            }
        });

        if (flags.length > 0 || item.status === 'failed') {
            issues.push({
                id: item.id,
                rowIndex: index,
                rowLabel: `第 ${index + 1} 行`,
                summary: getIssueSummary(item),
                warningFlags: flags,
                status: item.status || 'needs_review',
                description: item.description || '',
                category: item.category || ''
            });
        }
    });

    return {
        total: normalizedItems.length,
        readyCount,
        needsReviewCount,
        failedCount,
        warningCounts,
        issues,
        hasIssues: issues.length > 0,
        hasBlockingIssues: failedCount > 0
    };
}

function normalizeInvoiceItem(item = {}, options = {}) {
    const now = options.now || Date.now();
    const recognitionSource = options.recognitionSource || item.recognitionSource || 'manual';
    const lastError = options.clearLastError ? '' : (options.lastError !== undefined ? options.lastError : (item.lastError || ''));
    const preserveOcrFailure = options.preserveOcrFailure !== undefined
        ? options.preserveOcrFailure
        : Boolean(lastError && recognitionSource !== 'manual');

    const normalized = {
        id: item.id || now + Math.random(),
        file: item.file || null,
        isPDF: Boolean(item.isPDF),
        fileHash: item.fileHash || null,
        previewUrl: item.previewUrl || item.preview || null,
        preview: item.preview || item.previewUrl || null,

        orderImage: item.orderImage || null,
        paymentProof: item.paymentProof || null,
        attachments: Array.isArray(item.attachments) ? item.attachments : (item.attachments ? [item.attachments] : []),

        date: item.date || '',
        category: item.category || '其他',
        description: item.description || '',
        amount: Number(item.amount || 0),
        tax: Number(item.tax || 0),
        subtotal: Number(item.subtotal || 0),
        totalWithTax: Number(item.totalWithTax || item.amount || 0),

        itemName: item.itemName || '',
        specification: item.specification || '',
        unit: item.unit || '',
        quantity: Number(item.quantity || 0),
        unitPrice: Number(item.unitPrice || 0),
        taxRate: item.taxRate || '',
        invoiceNumber: item.invoiceNumber || '',
        buyerName: item.buyerName || '',
        sellerName: item.sellerName || '',
        remarks: item.remarks || '',

        reimburser: item.reimburser || '',
        project: item.project || '',

        recognitionSource,
        recognitionMeta: normalizeRecognitionMeta(options.recognitionMeta || item.recognitionMeta),
        lastError,
        createdAt: item.createdAt || now,
        updatedAt: options.updatedAt || now,
        isCached: Boolean(item.isCached || recognitionSource === 'cache')
    };

    const inheritedWarningFlags = normalizeWarningFlags(options.warningFlags || item.warningFlags);
    const shouldRevalidateKnownWarnings = recognitionSource === 'manual'
        && (item.status === 'needs_review'
            || item.status === 'failed'
            || inheritedWarningFlags.some(flag => REVALIDATABLE_WARNING_FLAGS.has(flag)));
    if (shouldRevalidateKnownWarnings) {
        const unknownWarnings = inheritedWarningFlags.filter(
            flag => !REVALIDATABLE_WARNING_FLAGS.has(flag)
        );
        normalized.warningFlags = normalizeWarningFlags([
            ...unknownWarnings,
            ...getRevalidatedWarningFlags(normalized)
        ]);
    } else {
        normalized.warningFlags = normalizeWarningFlags([
            ...inheritedWarningFlags,
            ...getWarningFlagsFromItem(normalized, { preserveOcrFailure })
        ]);
    }
    normalized.status = determineItemStatus(normalized, normalized.warningFlags, options.status);

    return normalized;
}

function buildCachePayload(item) {
    const payload = CACHEABLE_FIELDS.reduce((result, key) => {
        result[key] = item[key] !== undefined ? item[key] : (typeof item[key] === 'number' ? item[key] : '');
        return result;
    }, {});
    payload.status = RECOGNITION_STATUSES.has(item.status) ? item.status : undefined;
    payload.warningFlags = normalizeWarningFlags(item.warningFlags);
    payload.recognitionMeta = normalizeRecognitionMeta(item.recognitionMeta);
    return payload;
}

function createItemFromOCRData(response, file, isPDF, previewUrl, reimbursementInfo, index, fileHash, meta = {}) {
    const unwrapped = unwrapOcrResponse(response);
    const data = unwrapped.data;
    const rawItem = {
        id: meta.id || (Date.now() + index + Math.random()),
        file,
        isPDF,
        fileHash,
        previewUrl: previewUrl || URL.createObjectURL(file),
        preview: previewUrl || null,

        date: getValue(data, 'date'),
        category: getValue(data, 'category') || '其他',
        description: getValue(data, 'description') || file.name,
        amount: getNumberValue(data, 'amount'),
        tax: getNumberValue(data, 'tax'),
        subtotal: getNumberValue(data, 'subtotal') || (getNumberValue(data, 'amount') - getNumberValue(data, 'tax')),
        totalWithTax: getNumberValue(data, 'totalWithTax') || getNumberValue(data, 'amount'),

        itemName: getValue(data, 'itemName'),
        specification: getValue(data, 'specification'),
        unit: getValue(data, 'unit'),
        quantity: getNumberValue(data, 'quantity'),
        unitPrice: getNumberValue(data, 'unitPrice'),
        taxRate: getValue(data, 'taxRate'),
        invoiceNumber: getValue(data, 'invoiceNumber'),
        buyerName: getValue(data, 'buyerName'),
        sellerName: getValue(data, 'sellerName'),
        remarks: getValue(data, 'remarks'),

        attachments: [],
        reimburser: reimbursementInfo.reimburser || '',
        project: reimbursementInfo.project || ''
    };

    return normalizeInvoiceItem(rawItem, {
        id: meta.id,
        recognitionSource: meta.recognitionSource || 'ocr',
        status: meta.status || unwrapped.status,
        warningFlags: meta.warningFlags || unwrapped.warningFlags,
        recognitionMeta: meta.recognitionMeta || unwrapped.recognitionMeta
    });
}

function createPendingInvoiceItem(file, isPDF, reimbursementInfo, options = {}) {
    return normalizeInvoiceItem({
        id: options.id || Date.now() + Math.random(),
        file,
        isPDF,
        previewUrl: options.previewUrl || (!isPDF ? URL.createObjectURL(file) : null),
        date: '',
        category: '其他',
        description: file.name || '',
        reimburser: reimbursementInfo.reimburser || '',
        project: reimbursementInfo.project || ''
    }, {
        status: 'processing',
        recognitionSource: 'ocr'
    });
}

async function runWithConcurrency(tasks, limit, onProgress) {
    const results = [];
    const executing = [];
    let completed = 0;

    for (const taskWrapper of tasks) {
        const p = Promise.resolve().then(() => taskWrapper.task());
        results.push(p);

        const e = p.finally(() => {
            const idx = executing.indexOf(e);
            if (idx !== -1) executing.splice(idx, 1);
            completed++;
            if (onProgress) onProgress(completed, tasks.length);
        });

        executing.push(e);

        if (executing.length >= limit) {
            await Promise.race(executing).catch(() => { });
        }
    }

    return Promise.all(results);
}

async function processInvoiceFile(file, isPDF, reimbursementInfo, options = {}) {
    let processFile = file;
    let previewUrl = options.previewUrl || null;
    const index = options.index || 0;
    const signal = options.signal || null;
    const mode = options.mode || 'normal';
    const allowLocalRecovery = mode !== 'high_accuracy';

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    if (isPDF) {
        processFile = await window.convertPDFToImage(file);
        if (!processFile) throw new Error('PDF Conversion Failed (Check libs/cmaps)');
        previewUrl = previewUrl || URL.createObjectURL(processFile);
    } else {
        previewUrl = previewUrl || URL.createObjectURL(file);
    }

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const imgData = await window.processImage(processFile, { isPDF });
    if (!imgData || !imgData.compressedBase64) {
        throw new Error('Image Compression Failed (Timeout or Null)');
    }

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    if (allowLocalRecovery && window.storageRepo?.getCachedOcrResult) {
        const cached = await window.storageRepo.getCachedOcrResult(imgData.fileHash);
        if (cached?.result) {
            return createItemFromOCRData(cached.result, file, isPDF, previewUrl, reimbursementInfo, index, imgData.fileHash, {
                id: options.id,
                recognitionSource: 'cache'
            });
        }
    }

    if (allowLocalRecovery && window.storageRepo?.findRecordByHash) {
        const historyRecord = await window.storageRepo.findRecordByHash(imgData.fileHash);
        const snapshotItem = historyRecord?.snapshot?.items?.[0] || historyRecord?.items?.[0];
        if (snapshotItem) {
            return normalizeInvoiceItem({
                ...snapshotItem,
                id: options.id || (Date.now() + index + Math.random()),
                file,
                isPDF,
                fileHash: imgData.fileHash,
                previewUrl: previewUrl || snapshotItem.previewUrl || snapshotItem.preview || null,
                preview: previewUrl || snapshotItem.preview || snapshotItem.previewUrl || null,
                reimburser: reimbursementInfo.reimburser || snapshotItem.reimburser || '',
                project: reimbursementInfo.project || snapshotItem.project || ''
            }, {
                recognitionSource: 'cache',
                clearLastError: true
            });
        }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 130000);
    const handleExternalAbort = () => controller.abort();
    const throwIfRequestAborted = () => {
        if (controller.signal.aborted) {
            throw new DOMException('Aborted', 'AbortError');
        }
    };

    if (signal) {
        signal.addEventListener('abort', handleExternalAbort, { once: true });
    }

    try {
        const requestBody = JSON.stringify({
            image: imgData.compressedBase64,
            mode
        });
        let credential = getSessionAccessCredential();
        let promptedForCredential = false;
        let response;

        while (true) {
            response = await fetch('/api/ocr', {
                method: 'POST',
                headers: buildOcrRequestHeaders(credential),
                body: requestBody,
                signal: controller.signal
            });

            if (response.ok) break;

            const errorPayload = await response.json().catch(() => ({}));
            throwIfRequestAborted();

            if (response.status !== 403) {
                throw createOcrRequestError(errorPayload, response.status);
            }

            clearSessionAccessCredential();
            if (promptedForCredential) {
                throw new Error('访问凭证无效。请重新输入访问凭证，然后再次识别。');
            }

            promptedForCredential = true;
            const input = window.prompt?.('请输入访问凭证（仅在当前页面会话中保存，关闭页面后失效）：');
            const enteredCredential = String(input || '').trim();
            if (!enteredCredential) {
                throw new Error('尚未输入访问凭证。请输入访问凭证后重新识别。');
            }
            credential = saveSessionAccessCredential(enteredCredential);
            if (!credential) {
                throw new Error('当前浏览器无法安全保存访问凭证。请检查浏览器隐私设置后重试；如果仍然失败，请联系管理员。');
            }
        }

        const data = await response.json();
        throwIfRequestAborted();
        const result = window.processOCRResponse(data, file, isPDF, previewUrl, reimbursementInfo, index, imgData.fileHash, {
            id: options.id,
            recognitionSource: mode === 'high_accuracy' ? 'high_accuracy' : 'ocr'
        });
        throwIfRequestAborted();

        if (window.storageRepo?.saveCachedOcrResult) {
            await window.storageRepo.saveCachedOcrResult(imgData.fileHash, buildCachePayload(result), {
                modelVersion: result.recognitionMeta?.model || '',
                promptVersion: OCR_PROMPT_VERSION
            });
            throwIfRequestAborted();
        }

        return result;
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new DOMException('Aborted', 'AbortError');
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
        if (signal) {
            signal.removeEventListener('abort', handleExternalAbort);
        }
    }
}

async function processBatchFiles(files, reimbursementInfo, onProgressCallback, onControllerCallback) {
    const fileArray = Array.from(files);
    console.log(`[OCR] Batch processing ${fileArray.length} files (Unified Flow, 130s Request Budget)`);

    const tasks = fileArray.map((file, index) => ({
        id: file.name,
        task: async () => {
            const isPDF = file.type === 'application/pdf';
            const controller = new AbortController();

            if (onControllerCallback) onControllerCallback(index, controller);

            try {
                if (onProgressCallback) onProgressCallback(index, 'processing', 10);
                const result = await window.processInvoiceFile(file, isPDF, reimbursementInfo, {
                    index,
                    signal: controller.signal
                });
                if (onProgressCallback) onProgressCallback(index, 'completed', 100, result);
                return result;
            } catch (err) {
                if (err.name === 'AbortError') {
                    if (onProgressCallback) onProgressCallback(index, 'cancelled', 0, null);
                    return null;
                }

                const failed = window.createFailedItem(file, isPDF, err, reimbursementInfo, index);
                if (onProgressCallback) onProgressCallback(index, 'failed', 100, failed);
                return failed;
            }
        }
    }));

    return window.runWithConcurrency(tasks, 2, null);
}

async function analyzeInvoiceImage(file, isPDF, reimbursementInfo, index = 0, signal = null, options = {}) {
    return window.processInvoiceFile(file, isPDF, reimbursementInfo, {
        ...options,
        index,
        signal
    });
}

function processOCRResponse(data, file, isPDF, convertedImageUrl, reimbursementInfo, index, fileHash, meta = {}) {
    return createItemFromOCRData(data, file, isPDF, convertedImageUrl, reimbursementInfo, index, fileHash, {
        ...meta,
        recognitionSource: meta.recognitionSource || 'ocr'
    });
}

function createFailedItem(file, isPDF, error, reimbursementInfo, index = 0, options = {}) {
    const message = getUserFacingRecognitionError(error);
    return normalizeInvoiceItem({
        id: options.id || (Date.now() + index + Math.random()),
        file,
        isPDF,
        previewUrl: options.previewUrl || URL.createObjectURL(file),
        preview: options.previewUrl || null,
        date: new Date().toISOString().split('T')[0],
        amount: 0,
        tax: 0,
        subtotal: 0,
        totalWithTax: 0,
        category: '其他',
        description: message,
        itemName: '',
        specification: '',
        unit: '',
        quantity: 0,
        unitPrice: 0,
        taxRate: '',
        invoiceNumber: '',
        buyerName: '',
        sellerName: '',
        attachments: [],
        remarks: '',
        reimburser: reimbursementInfo.reimburser || '',
        project: reimbursementInfo.project || ''
    }, {
        recognitionSource: 'ocr',
        status: 'failed',
        lastError: message,
        preserveOcrFailure: true
    });
}

// Global Exports
window.analyzeInvoiceImage = analyzeInvoiceImage;
window.processInvoiceFile = processInvoiceFile;
window.processBatchFiles = processBatchFiles;
window.processOCRResponse = processOCRResponse;
window.unwrapOcrResponse = unwrapOcrResponse;
window.buildCachePayload = buildCachePayload;
window.createFailedItem = createFailedItem;
window.createPendingInvoiceItem = createPendingInvoiceItem;
window.normalizeInvoiceItem = normalizeInvoiceItem;
window.getWarningFlagsFromItem = getWarningFlagsFromItem;
window.getWarningLabel = getWarningLabel;
window.getIssueSummary = getIssueSummary;
window.getExportReadiness = getExportReadiness;
window.getUserFacingRecognitionError = getUserFacingRecognitionError;
window.runWithConcurrency = runWithConcurrency;
