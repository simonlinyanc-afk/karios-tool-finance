/**
 * Storage Repository for Yellow Bird Finance
 * Uses Dexie.js for IndexedDB management
 * Handles Drafts, Export History, and Print Jobs
 * Refactored: 2026-02-04 (Strict Decoupling & Modularization & IIFE)
 */

(function () {
    // ==========================================
    // Section: Database Initialization
    // ==========================================
    const db = new Dexie('KairosDB');

    // Define Schema
    db.version(1).stores({
        drafts: '++id, timestamp',
        history: '++id, timestamp, total, count'
    });

    db.version(2).stores({
        history: '++id, timestamp, total, count, fileHashIndex'
    });

    db.version(3).stores({
        templates: '++id, timestamp, name'
    });

    db.version(4).stores({
        printJobs: '++id, timestamp'
    });


    // ==========================================
    // Section: Image Processing Helper (Decoupled)
    // ==========================================

    const imageCache = new Map();
    // Local scope pendingRequests to avoid collision with imageProcessor.js
    const pendingRequests = new Map();

    /**
     * Internal helper to process a single image field
     * Delegates actual compression to window.resizeCanvas
     */
    async function _processImageField(blobUrl, contextTag = 'Storage') {
        // Handle Arrays (Recursive)
        if (Array.isArray(blobUrl)) {
            return Promise.all(blobUrl.map(url => _processImageField(url, contextTag)));
        }

        if (!blobUrl || typeof blobUrl !== 'string' || !blobUrl.startsWith('blob:')) return blobUrl;

        // 1. Check Cache
        if (imageCache.has(blobUrl)) return imageCache.get(blobUrl);

        // 2. Check Pending (Deduplication)
        if (pendingRequests.has(blobUrl)) {
            console.log(`[${contextTag}] ⏳ Waiting for pending process: ${blobUrl}`);
            return pendingRequests.get(blobUrl);
        }

        console.log(`[${contextTag}] 🔄 Processing new blob: ${blobUrl}`);

        // 3. Process
        const processPromise = (async () => {
            let result = null;
            try {
                // STRICT DELEGATION: Call global resizeCanvas
                // Params: source, maxDim=1200, quality=0.7, isFile=false (since blobUrl is a string URL)
                const resized = await window.resizeCanvas(blobUrl, 1200, 0.7, false);

                if (resized) {
                    result = resized;
                } else {
                    // Fallback: If resize fails (e.g. PDF or weird format), try direct conversion
                    console.warn(`[${contextTag}] ⚠️ Resize returned null, trying direct conversion`);
                    result = await window.blobToBase64(blobUrl);
                }

                if (result) {
                    imageCache.set(blobUrl, result);
                    console.log(`[${contextTag}] ✅ Cached successfully`);
                } else {
                    console.warn(`[${contextTag}] ❌ Processing permanently failed`);
                }
            } catch (error) {
                console.error(`[${contextTag}] ❌ Error processing image:`, error);
            } finally {
                pendingRequests.delete(blobUrl);
            }
            return result;
        })();

        pendingRequests.set(blobUrl, processPromise);
        return processPromise;
    }

    /**
     * Unified helper to prepare items for storage
     * Iterates items and processes standard image fields
     */
    async function _prepareItemsForStorage(items, contextTag) {
        if (!items || !Array.isArray(items)) return [];

        return Promise.all(items.map(async (item) => {
            const newItem = { ...item };

            // Process standard image fields
            newItem.previewUrl = await _processImageField(newItem.previewUrl, contextTag);
            newItem.orderImage = await _processImageField(newItem.orderImage, contextTag);
            newItem.paymentProof = await _processImageField(newItem.paymentProof, contextTag);
            newItem.attachments = await _processImageField(newItem.attachments, contextTag);

            // Cleanup non-serializable objects
            delete newItem.file;

            return newItem;
        }));
    }


    // ==========================================
    // Section: Drafts Management
    // ==========================================

    async function saveCurrentDraft(items, info) {
        try {
            const processedItems = await _prepareItemsForStorage(items, 'DraftSave');

            await db.drafts.put({
                id: 1,
                timestamp: Date.now(),
                items: processedItems,
                info: info
            });
            console.log('✅ Draft saved to local storage');
        } catch (error) {
            _handleError(error, 'saveDraft');
        }
    }

    async function getLatestDraft() {
        try {
            return await db.drafts.get(1);
        } catch (e) { return null; }
    }

    async function deleteDraft() {
        try {
            await db.drafts.delete(1);
        } catch (e) {
            console.error('Failed to delete draft', e);
        }
    }


    // ==========================================
    // Section: History & Archives
    // ==========================================

    async function archiveToHistory(items, info, columns = [], fileHash = null) {
        try {
            const processedItems = await _prepareItemsForStorage(items, 'Archive');

            // Calculate Total
            const totalAmount = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);

            // Generate Title (Formatted: Value_Reimburser_Amount_Date)
            const safeProject = info.project || '无项目';
            const safeReimburser = info.reimburser || '无报销人';
            const safeTotal = totalAmount.toFixed(2); // Keep 2 decimals

            // Ensure Date is YYYY-MM-DD
            let safeDate;
            if (info.reimbursementDate) {
                safeDate = info.reimbursementDate; // Assuming input is already YYYY-MM-DD from date picker
            } else {
                safeDate = new Date().toISOString().split('T')[0];
            }

            const generatedTitle = `${safeProject}_${safeReimburser}_${safeTotal}_${safeDate}`;

            const record = {
                timestamp: Date.now(),
                title: generatedTitle,
                snapshot: {
                    items: processedItems,
                    info: info,
                    columns: columns
                },
                total: totalAmount,
                count: items.length,
                project: info.project,
                reimburser: info.reimburser,
                fileHashIndex: fileHash || undefined
            };

            await db.history.add(record);
            console.log(`✅ Export archived: ${generatedTitle}`);

        } catch (error) {
            _handleError(error, 'archiveHistory');
        }
    }

    async function getHistoryRecords() {
        try {
            return await db.history.orderBy('timestamp').reverse().toArray();
        } catch (error) {
            console.error('Failed to fetch history', error);
            return [];
        }
    }

    async function findRecordByHash(hash) {
        if (!hash) return null;
        return await db.history.where('fileHashIndex').equals(hash).first();
    }

    async function deleteHistoryItem(id) {
        try {
            await db.history.delete(id);
            console.log(`Deleted history ${id}`);
        } catch (e) { console.error(e); }
    }

    async function clearAllHistory() {
        await db.history.clear();
    }

    async function updateHistoryTitle(id, newTitle) {
        await db.history.update(id, { title: newTitle });
    }


    // ==========================================
    // Section: Utils (Print & Maintenance)
    // ==========================================

    async function savePrintJob(data) {
        try {
            // Auto-cleanup: Delete jobs older than 1 hour
            const oneHourAgo = Date.now() - (60 * 60 * 1000);
            const deleted = await db.printJobs.where('timestamp').below(oneHourAgo).delete();
            if (deleted > 0) console.log(`🧹 Cleaned ${deleted} old print jobs`);

            const id = await db.printJobs.add({
                timestamp: Date.now(),
                data: data
            });
            return id;
        } catch (error) {
            console.error('Failed to save print job', error);
            throw error;
        }
    }

    async function getPrintJob(id) {
        try {
            const record = await db.printJobs.get(id);
            return record ? record.data : null;
        } catch (e) { return null; }
    }

    async function autoCleanup30Days() {
        try {
            const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
            const count = await db.history.where('timestamp').below(thirtyDaysAgo).delete();
            if (count > 0) console.log(`🧹 Auto-cleaned ${count} old history records`);
        } catch (e) { console.error(e); }
    }

    function _handleError(error, context) {
        if (error.name === 'QuotaExceededError') {
            console.error('❌ Storage Quota Exceeded');
        } else {
            console.error(`❌ ${context} Failed:`, error);
        }
    }

    // ==========================================
    // Section: Exports
    // ==========================================

    window.storageRepo = {
        db,
        saveCurrentDraft,
        getLatestDraft,
        deleteDraft,
        archiveToHistory,
        getHistoryRecords,
        findRecordByHash,
        deleteHistoryItem,
        clearAllHistory,
        autoCleanup30Days,
        savePrintJob,
        getPrintJob,
        updateHistoryTitle
    };

})();
