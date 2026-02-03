/**
 * Storage Repository for Yellow Bird Finance
 * Uses Dexie.js for IndexedDB management
 * Handles Drafts, Export History, and Print Jobs
 */

// Initialize Database
const db = new Dexie('KairosDB');

// Define Schema (Version 1)
db.version(1).stores({
    drafts: '++id, timestamp', // Auto-increment ID, indexed by timestamp
    history: '++id, timestamp, total, count' // Auto-increment ID, indexed by timestamp
});

// Upgrade Schema (Version 2) - Add fileHashIndex
db.version(2).stores({
    history: '++id, timestamp, total, count, fileHashIndex' // Added fileHashIndex
});

// Upgrade Schema (Version 3) - Add Templates
db.version(3).stores({
    templates: '++id, timestamp, name'
});

// Upgrade Schema (Version 4) - Add PrintJobs (Ephemeral)
db.version(4).stores({
    printJobs: '++id, timestamp'
});

/**
 * Save current Draft
 * Overwrites the single draft entry or creates one if not exists
 * @param {Array} items 
 * @param {Object} info 
 * @returns {Promise<void>}
 */
async function saveCurrentDraft(items, info) {
    try {
        // Process items to convert Blob URLs to Base64 for storage (safe draft)
        const processedItems = await Promise.all(items.map(async (item) => {
            const newItem = { ...item };

            // 1. Preview Image
            if (newItem.previewUrl && newItem.previewUrl.startsWith('blob:')) {
                newItem.previewUrl = await window.resizeImage(newItem.previewUrl, 0.6) || newItem.previewUrl;
                if (newItem.previewUrl.startsWith('blob:')) {
                    newItem.previewUrl = await window.blobToBase64(newItem.previewUrl) || null;
                }
            }

            // 2. Order Screenshot
            if (newItem.orderImage && newItem.orderImage.startsWith('blob:')) {
                newItem.orderImage = await window.resizeImage(newItem.orderImage, 0.6) || newItem.orderImage;
            }

            // 3. Payment Proof
            if (newItem.paymentProofImage && newItem.paymentProofImage.startsWith('blob:')) {
                newItem.paymentProofImage = await window.resizeImage(newItem.paymentProofImage, 0.6) || newItem.paymentProofImage;
            }

            // Remove 'file' object
            delete newItem.file;

            return newItem;
        }));

        await db.drafts.put({
            id: 1,
            timestamp: Date.now(),
            items: processedItems,
            info: info
        });
        console.log('✅ Draft saved to local storage with images');
    } catch (error) {
        if (error.name === 'QuotaExceededError') {
            console.error('❌ Storage quota exceeded');
            // Optional: Notify user or handle gracefully
        } else {
            console.error('❌ Failed to save draft:', error);
        }
    }
}

/**
 * Archive to History (v1.1.0 Upgrade)
 * Stores a full snapshot of the project state
 * @param {Array} items 
 * @param {Object} info 
 * @param {Array} columns - Added in v1.1.0
 * @param {string} fileHash - Added in v1.2.0 for instant match
 * @returns {Promise<void>}
 */
async function archiveToHistory(items, info, columns = [], fileHash = null) {
    try {
        const totalAmount = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);

        // Generate Title: Project_Reimburser_Total_Date
        const safeProject = info.project || '无项目';
        const safeReimburser = info.reimburser || '无报销人';
        const safeTotal = totalAmount.toFixed(2);
        const safeDate = info.reimbursementDate || new Date().toISOString().split('T')[0];

        const generatedTitle = `${safeProject}_${safeReimburser}_${safeTotal}_${safeDate}`;

        // Process items to convert Blob URLs to Base64 for storage
        const processedItems = await Promise.all(items.map(async (item) => {
            const newItem = { ...item };

            // 1. Preview Image
            if (newItem.previewUrl && newItem.previewUrl.startsWith('blob:')) {
                newItem.previewUrl = await window.resizeImage(newItem.previewUrl, 0.6) || newItem.previewUrl;
                if (newItem.previewUrl.startsWith('blob:')) {
                    newItem.previewUrl = await window.blobToBase64(newItem.previewUrl) || null;
                }
            }

            // 2. Order Screenshot
            if (newItem.orderImage && newItem.orderImage.startsWith('blob:')) {
                newItem.orderImage = await window.resizeImage(newItem.orderImage, 0.6) || newItem.orderImage;
            }

            // 3. Payment Proof
            if (newItem.paymentProofImage && newItem.paymentProofImage.startsWith('blob:')) {
                newItem.paymentProofImage = await window.resizeImage(newItem.paymentProofImage, 0.6) || newItem.paymentProofImage;
            }

            delete newItem.file;
            return newItem;
        }));

        // Create Snapshot
        const snapshot = {
            items: processedItems,
            info: info,
            columns: columns
        };

        const record = {
            timestamp: Date.now(),
            title: generatedTitle,
            snapshot: snapshot,
            total: totalAmount,
            count: items.length,
            project: info.project,
            reimburser: info.reimburser
        };

        // Add Hash if present
        if (fileHash) {
            record.fileHashIndex = fileHash;
        }

        await db.history.add(record);
        console.log(`✅ Export archived to history (Has Hash: ${!!fileHash})`);
    } catch (error) {
        if (error.name === 'QuotaExceededError') {
            console.error('❌ Storage quota exceeded');
            throw new Error('STORAGE_QUOTA_EXCEEDED');
        } else {
            console.error('❌ Failed to archive history:', error);
        }
    }
}

/**
 * Get latest draft
 * @returns {Promise<Object|null>}
 */
async function getLatestDraft() {
    try {
        return await db.drafts.get(1);
    } catch (e) {
        return null;
    }
}

/**
 * Delete draft
 * @returns {Promise<void>}
 */
async function deleteDraft() {
    try {
        await db.drafts.delete(1);
    } catch (e) {
        console.error('Failed to delete draft', e);
    }
}

async function clearAllHistory() {
    try {
        await db.history.clear();
        console.log('✅ All history cleared');
    } catch (error) {
        console.error('❌ Failed to clear history:', error);
    }
}

/**
 * Get all history records
 * @returns {Promise<Array>}
 */
async function getHistoryRecords() {
    try {
        // Return sorted by timestamp desc
        return await db.history.orderBy('timestamp').reverse().toArray();
    } catch (error) {
        console.error('❌ Failed to fetch history:', error);
        return [];
    }
}

/**
 * Find record by hash (Instant Match)
 * @param {string} hash 
 * @returns {Promise<Object|null>}
 */
async function findRecordByHash(hash) {
    try {
        if (!hash) return null;
        return await db.history.where('fileHashIndex').equals(hash).first();
    } catch (error) {
        console.error('❌ Failed to find record by hash:', error);
        return null;
    }
}

/**
 * Delete a specific history item
 * @param {number} id 
 * @returns {Promise<void>}
 */
async function deleteHistoryItem(id) {
    try {
        await db.history.delete(id);
        console.log(`✅ History item ${id} deleted`);
    } catch (error) {
        console.error(`❌ Failed to delete history item ${id}:`, error);
    }
}

/**
 * Auto Cleanup records older than 30 days
 * Should be called on app start
 * @returns {Promise<void>}
 */
async function autoCleanup30Days() {
    try {
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        const deleteCount = await db.history.where('timestamp').below(thirtyDaysAgo).delete();
        if (deleteCount > 0) {
            console.log(`🧹 Auto-cleaned ${deleteCount} old history records`);
        }
    } catch (error) {
        console.error('❌ Auto-cleanup failed:', error);
    }
}

/**
 * Save Print Job (Ephemeral)
 * Stores the full print data (including raw Blobs)
 * @param {Object} data 
 * @returns {Promise<number>} jobId
 */
async function savePrintJob(data) {
    try {
        // Clean up old jobs (> 1 hour) first
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        db.printJobs.where('timestamp').below(oneHourAgo).delete();

        const id = await db.printJobs.add({
            timestamp: Date.now(),
            data: data
        });
        return id;
    } catch (error) {
        console.error('❌ Failed to save print job:', error);
        throw error;
    }
}

/**
 * Get Print Job
 * @param {number} id 
 * @returns {Promise<Object>}
 */
async function getPrintJob(id) {
    try {
        const record = await db.printJobs.get(id);
        return record ? record.data : null;
    } catch (error) {
        console.error('❌ Failed to get print job:', error);
        return null;
    }
}

// Make functions global
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
    updateHistoryTitle: async (id, newTitle) => {
        try {
            await db.history.update(id, { title: newTitle });
            console.log(`✅ History item ${id} renamed to ${newTitle}`);
        } catch (error) {
            console.error(`❌ Failed to rename history item ${id}:`, error);
        }
    }
};
