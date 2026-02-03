// OCR Client Utilities (Single Stream V2)
// Unified Architecture: All inputs converted to 1500px/0.7 Compressed Base64

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

async function processBatchFiles(files, reimbursementInfo, onProgressCallback, onControllerCallback) {
    const fileArray = Array.from(files);
    console.log(`[OCR] Batch processing ${fileArray.length} files (Single Stream, 1500px, 60s Timeout)`);

    const tasks = fileArray.map((file, i) => ({
        id: file.name,
        task: async () => {
            const isPDF = file.type === 'application/pdf';
            const controller = new AbortController();

            // Register controller for cancellation
            if (onControllerCallback) {
                onControllerCallback(i, controller);
            }

            try {
                if (onProgressCallback) onProgressCallback(i, 'processing', 10);
                const result = await window.analyzeInvoiceImage(file, isPDF, reimbursementInfo, i, controller.signal);
                if (onProgressCallback) onProgressCallback(i, 'completed', 100, result);
                return result;
            } catch (err) {
                if (err.name === 'AbortError') {
                    console.warn(`[OCR] Task ${file.name} Cancelled`);
                    if (onProgressCallback) onProgressCallback(i, 'cancelled', 0, null);
                    return null; // Cancelled
                }
                console.error(`[FATAL] ${file.name} Processing Error:`, err);
                const failed = window.createFailedItem(file, isPDF, err, reimbursementInfo, i);
                if (onProgressCallback) onProgressCallback(i, 'failed', 100, failed);
                return failed;
            }
        }
    }));
    return window.runWithConcurrency(tasks, 2, null);
}

async function analyzeInvoiceImage(file, isPDF, reimbursementInfo, index = 0, signal = null) {
    let processFile = file;
    let previewUrl = null;

    // Check signal before heavy work
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    // 1. PDF Conversion (Single Stream: 1500px, 0.7q)
    if (isPDF) {
        processFile = await window.convertPDFToImage(file);
        if (!processFile) throw new Error("PDF Conversion Failed (Check libs/cmaps)");
        previewUrl = URL.createObjectURL(processFile);
    }

    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    // 2. Image Processing (Unified 1500px Resize + Hash)
    let imgData;
    try {
        imgData = await window.processImage(processFile);
    } catch (e) {
        console.error("processImage Sync Error", e);
        throw new Error("Image Processing Failed");
    }

    if (!imgData || !imgData.compressedBase64) {
        throw new Error("Image Compression Failed (Timeout or Null)");
    }

    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    // 3. Cache Check
    if (window.storageRepo && window.storageRepo.findRecordByHash) {
        const cached = await window.storageRepo.findRecordByHash(imgData.fileHash);
        if (cached) {
            console.log(`[OCR] Cache hit for ${file.name}`);
            const item = cached.snapshot.items[0];
            return { ...item, id: Date.now() + index, file, isPDF, previewUrl: previewUrl || item.previewUrl, isCached: true };
        }
    }

    // 4. API Request (Unified Stream, 60s Timeout)
    const controller = new AbortController();

    // Merge external signal with internal timeout
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    // Listen to external signal to abort internal fetch
    if (signal) {
        signal.addEventListener('abort', () => {
            clearTimeout(timeoutId);
            controller.abort();
        });
    }

    try {
        const response = await fetch('/api/ocr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: imgData.compressedBase64 }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        const data = await response.json();

        return window.processOCRResponse(data, file, isPDF, previewUrl, reimbursementInfo, index, imgData.fileHash);
    } catch (e) {
        if (e.name === 'AbortError') throw new DOMException("Aborted", "AbortError"); // Normalize
        throw e;
    }
}

/**
 * Process OCR API Response (Handles Short Keys)
 */
function processOCRResponse(data, file, isPDF, convertedImageUrl, reimbursementInfo, index, fileHash) {
    const id = Date.now() + index + Math.random();

    // Map Short Keys (Token Reduction)
    const mapReverse = {
        date: 'd',
        amount: 't',
        tax: 'x',
        description: 's',
        category: 'c',
        invoiceNumber: 'n'
    };

    const val = (key, shortKey) => data[key] !== undefined ? data[key] : (data[shortKey] !== undefined ? data[shortKey] : "");
    const valNum = (key, shortKey) => {
        const v = val(key, shortKey);
        return v ? parseFloat(v) : 0;
    };

    const amount = valNum('amount', 't');
    const tax = valNum('tax', 'x');
    const subtotal = valNum('subtotal', null) || (amount - tax);

    return {
        id: id,
        file: file,
        isPDF: isPDF,
        fileHash: fileHash,
        previewUrl: convertedImageUrl || URL.createObjectURL(file),
        preview: convertedImageUrl || null,

        date: val('date', 'd'),
        category: val('category', 'c') || "其他",
        description: val('description', 's') || file.name,
        amount: amount,
        tax: tax,
        subtotal: subtotal,
        totalWithTax: amount,

        itemName: data.itemName || "",
        specification: data.specification || "",
        unit: data.unit || "",
        quantity: data.quantity || 0,
        unitPrice: data.unitPrice || 0,
        taxRate: data.taxRate || "",
        invoiceNumber: data.invoiceNumber || "",
        buyerName: data.buyerName || "",
        sellerName: data.sellerName || "",

        attachments: [],
        remarks: data.remarks || "",
        reimburser: reimbursementInfo.reimburser || "",
        project: reimbursementInfo.project || ""
    };
}

function createFailedItem(file, isPDF, error, reimbursementInfo, index) {
    const id = Date.now() + index + Math.random();
    return {
        id: id,
        file: file,
        isPDF: isPDF,
        previewUrl: URL.createObjectURL(file),
        date: new Date().toISOString().split('T')[0],
        amount: 0,
        tax: 0,
        category: "其他",
        description: `识别失败：${file.name} (${error?.message || error})`,
        itemName: "", specification: "", unit: "", quantity: 0, unitPrice: 0, taxRate: "", subtotal: 0, totalWithTax: 0,
        invoiceNumber: "", buyerName: "", sellerName: "", attachments: [], remarks: "",
        reimburser: reimbursementInfo.reimburser || "",
        project: reimbursementInfo.project || ""
    };
}

// Global Exports
window.analyzeInvoiceImage = analyzeInvoiceImage;
window.processBatchFiles = processBatchFiles;
window.processOCRResponse = processOCRResponse;
window.createFailedItem = createFailedItem;
window.runWithConcurrency = runWithConcurrency;
