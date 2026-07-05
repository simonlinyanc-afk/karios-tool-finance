// OCR Client Utilities
// Unified Architecture: single OCR orchestrator for batch and single-item uploads.

const OCR_PROMPT_VERSION = 'v2-short-keys';

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
    missing_date: '缺少日期',
    missing_amount: '缺少金额',
    missing_description: '缺少摘要说明',
    ocr_failed: 'OCR 识别失败'
};

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

function normalizeWarningFlags(flags) {
    return Array.from(new Set((flags || []).filter(Boolean)));
}

function getWarningFlagsFromItem(item, { preserveOcrFailure = false } = {}) {
    const flags = [];

    if (!item.date) flags.push('missing_date');
    if (!(Number(item.amount) > 0)) flags.push('missing_amount');
    if (!String(item.description || '').trim()) flags.push('missing_description');
    if (preserveOcrFailure) flags.push('ocr_failed');

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
    return WARNING_FLAG_LABELS[flag] || flag;
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
        missing_date: 0,
        missing_amount: 0,
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
        lastError,
        createdAt: item.createdAt || now,
        updatedAt: options.updatedAt || now,
        isCached: Boolean(item.isCached || recognitionSource === 'cache')
    };

    normalized.warningFlags = getWarningFlagsFromItem(normalized, { preserveOcrFailure });
    normalized.status = determineItemStatus(normalized, normalized.warningFlags, options.status);

    return normalized;
}

function buildCachePayload(item) {
    return CACHEABLE_FIELDS.reduce((payload, key) => {
        payload[key] = item[key] !== undefined ? item[key] : (typeof item[key] === 'number' ? item[key] : '');
        return payload;
    }, {});
}

function createItemFromOCRData(data, file, isPDF, previewUrl, reimbursementInfo, index, fileHash, meta = {}) {
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
        status: meta.status
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
        const response = await fetch('/api/ocr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image: imgData.compressedBase64,
                mode
            }),
            signal: controller.signal
        });

        if (!response.ok) {
            const errorPayload = await response.json().catch(() => ({}));
            throwIfRequestAborted();
            throw new Error(errorPayload.details || errorPayload.error || `API Error: ${response.status}`);
        }

        const data = await response.json();
        throwIfRequestAborted();
        const result = window.processOCRResponse(data, file, isPDF, previewUrl, reimbursementInfo, index, imgData.fileHash, {
            id: options.id
        });
        throwIfRequestAborted();

        if (window.storageRepo?.saveCachedOcrResult) {
            await window.storageRepo.saveCachedOcrResult(imgData.fileHash, buildCachePayload(result), {
                modelVersion: data.meta?.model || '',
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
    const message = error?.message || String(error || 'OCR Failed');
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
        description: `识别失败：${file.name} (${message})`,
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
window.createFailedItem = createFailedItem;
window.createPendingInvoiceItem = createPendingInvoiceItem;
window.normalizeInvoiceItem = normalizeInvoiceItem;
window.getWarningFlagsFromItem = getWarningFlagsFromItem;
window.getWarningLabel = getWarningLabel;
window.getIssueSummary = getIssueSummary;
window.getExportReadiness = getExportReadiness;
window.runWithConcurrency = runWithConcurrency;
