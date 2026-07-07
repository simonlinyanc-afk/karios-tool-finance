(function () {
const FILE_STATUS = Object.freeze({
    PENDING: 'pending',
    PROCESSING: 'processing',
    AUTO_REVIEWING: 'auto_reviewing',
    DONE: 'done',
    REVIEW: 'review',
    FAILED: 'failed',
    ENHANCING: 'enhancing',
    CANCELLED: 'cancelled'
});

const WORKSPACE_STATE = Object.freeze({
    IDLE: 'idle',
    PROCESSING: 'processing',
    ENHANCING: 'enhancing',
    COMPLETE: 'complete',
    RESETTING: 'resetting'
});

const RESULT_TIMING = Object.freeze({
    SUCCESS_AUTO_DISMISS_MS: 1600,
    REVIEW_AUTO_DISMISS_MS: 3600,
    RESET_TRANSITION_MS: 920,
    AUTO_REVIEW_AFTER_MS: 3500
});

const ISSUE_LIST_LIMIT = 4;

const STATUS_META = Object.freeze({
    [FILE_STATUS.PENDING]: { note: '等待识别', icon: '' },
    [FILE_STATUS.PROCESSING]: { note: '正在识别', icon: '' },
    [FILE_STATUS.AUTO_REVIEWING]: {
        note: '正在自动复查',
        icon: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4.5 8h7" stroke="currentColor" stroke-linecap="round"/></svg>'
    },
    [FILE_STATUS.DONE]: {
        note: '识别完成',
        icon: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.5 8.2l3 3 6-6.4" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    },
    [FILE_STATUS.REVIEW]: {
        note: '建议检查',
        icon: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4.5 8h7" stroke="currentColor" stroke-linecap="round"/></svg>'
    },
    [FILE_STATUS.FAILED]: {
        note: '识别失败，请手动填写或重新上传',
        icon: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M5 5l6 6M11 5l-6 6" stroke="currentColor" stroke-linecap="round"/></svg>'
    },
    [FILE_STATUS.ENHANCING]: {
        note: '正在增强识别',
        icon: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4.5 8h7" stroke="currentColor" stroke-linecap="round"/></svg>'
    },
    [FILE_STATUS.CANCELLED]: {
        note: '已取消',
        icon: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4.5 8h7" stroke="currentColor" stroke-linecap="round"/></svg>'
    }
});

const TERMINAL_FILE_STATUSES = new Set([
    FILE_STATUS.DONE,
    FILE_STATUS.REVIEW,
    FILE_STATUS.FAILED,
    FILE_STATUS.CANCELLED
]);

const ACTIVE_PIPELINE_STATUSES = new Set([
    'processing',
    'preparing',
    'uploading',
    'recognizing'
]);

const isTerminalFileStatus = status => TERMINAL_FILE_STATUSES.has(status);

const normalizeStatusValue = value => (
    typeof value === 'string' ? value.trim().toLowerCase() : ''
);

const mapResultStatusToFileStatus = resultStatus => {
    const normalized = normalizeStatusValue(resultStatus);
    if (!normalized) return null;
    if (normalized === 'ready' || normalized === 'completed_ready') return FILE_STATUS.DONE;
    if (normalized === 'needs_review' || normalized === 'review') return FILE_STATUS.REVIEW;
    if (normalized === 'failed' || normalized === 'error') return FILE_STATUS.FAILED;
    return null;
};

const mapPipelineStatusToFileStatus = status => {
    const normalized = normalizeStatusValue(status);
    if (!normalized) return null;
    if (normalized === 'cancelled') return FILE_STATUS.CANCELLED;
    if (normalized === 'waiting' || normalized === 'queued' || normalized === 'pending') {
        return FILE_STATUS.PENDING;
    }
    if (ACTIVE_PIPELINE_STATUSES.has(normalized)) return FILE_STATUS.PROCESSING;
    if (normalized === 'auto_reviewing' || normalized === 'reviewing' || normalized === 'high_accuracy') {
        return FILE_STATUS.AUTO_REVIEWING;
    }
    if (normalized === 'failed' || normalized === 'error') return FILE_STATUS.FAILED;
    if (normalized === 'needs_review') return FILE_STATUS.REVIEW;
    if (normalized === 'completed' || normalized === 'ready') return FILE_STATUS.DONE;
    return null;
};

const mapQueueItemToFileStatus = (item, autoReviewIds = new Set()) => {
    if (!item) return FILE_STATUS.PENDING;
    if (item.displayStatus === FILE_STATUS.ENHANCING) return FILE_STATUS.ENHANCING;

    const rawStatus = normalizeStatusValue(item.status);
    const resultStatus = mapResultStatusToFileStatus(item.resultStatus);
    if (resultStatus) return resultStatus;

    if (rawStatus === 'cancelled') return FILE_STATUS.CANCELLED;

    if (item.displayStatus === FILE_STATUS.AUTO_REVIEWING || autoReviewIds.has(item.id)) {
        if (ACTIVE_PIPELINE_STATUSES.has(rawStatus)) {
            return FILE_STATUS.AUTO_REVIEWING;
        }
    }

    const pipelineStatus = mapPipelineStatusToFileStatus(item.status);
    if (pipelineStatus) return pipelineStatus;

    return FILE_STATUS.PENDING;
};

const countBatch = (queue, autoReviewIds = new Set()) => {
    const statuses = queue.map(item => mapQueueItemToFileStatus(item, autoReviewIds));
    return {
        done: statuses.filter(status => status === FILE_STATUS.DONE).length,
        review: statuses.filter(status => status === FILE_STATUS.REVIEW).length,
        failed: statuses.filter(status => status === FILE_STATUS.FAILED).length,
        finished: statuses.filter(status => isTerminalFileStatus(status)).length,
        total: queue.length
    };
};

const getWorkingTitle = (queue, autoReviewIds = new Set(), isEnhancing = false) => {
    if (isEnhancing || queue.some(item => mapQueueItemToFileStatus(item, autoReviewIds) === FILE_STATUS.ENHANCING)) {
        return '增强识别中…';
    }
    if (queue.some(item => mapQueueItemToFileStatus(item, autoReviewIds) === FILE_STATUS.AUTO_REVIEWING)) {
        return '正在自动复查…';
    }
    return '识别中…';
};

const buildCompleteSummary = counts => {
    const parts = [`${counts.done} 份已完成`];
    if (counts.review > 0) parts.push(`${counts.review} 份建议检查`);
    if (counts.failed > 0) parts.push(`${counts.failed} 份失败`);
    return `${parts.join('，')}。`;
};

window.UploadWorkspaceHelpers = {
    FILE_STATUS,
    WORKSPACE_STATE,
    RESULT_TIMING,
    ISSUE_LIST_LIMIT,
    STATUS_META,
    mapQueueItemToFileStatus,
    countBatch,
    getWorkingTitle,
    buildCompleteSummary,
    isTerminalFileStatus
};
})();
