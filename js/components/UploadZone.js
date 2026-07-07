/* Defensive access — prevents React #130 black screen if uploadWorkspaceState.js
   fails to load (404 / case-sensitivity on Linux). Falls back to inline defaults
   so the component always renders even without the helper script. */
const _helpers = window.UploadWorkspaceHelpers || {};
if (!window.UploadWorkspaceHelpers) {
    console.warn('[UploadZone] window.UploadWorkspaceHelpers not found — using inline fallback defaults');
}

const FILE_STATUS = _helpers.FILE_STATUS || Object.freeze({
    PENDING: 'pending',
    PROCESSING: 'processing',
    AUTO_REVIEWING: 'auto_reviewing',
    DONE: 'done',
    REVIEW: 'review',
    FAILED: 'failed',
    ENHANCING: 'enhancing',
    CANCELLED: 'cancelled'
});

const WORKSPACE_STATE = _helpers.WORKSPACE_STATE || Object.freeze({
    IDLE: 'idle',
    PROCESSING: 'processing',
    ENHANCING: 'enhancing',
    COMPLETE: 'complete',
    RESETTING: 'resetting'
});

const RESULT_TIMING = _helpers.RESULT_TIMING || Object.freeze({
    SUCCESS_AUTO_DISMISS_MS: 1600,
    REVIEW_AUTO_DISMISS_MS: 3600,
    RESET_TRANSITION_MS: 920,
    AUTO_REVIEW_AFTER_MS: 3500
});

const ISSUE_LIST_LIMIT = _helpers.ISSUE_LIST_LIMIT != null ? _helpers.ISSUE_LIST_LIMIT : 4;

const STATUS_META = _helpers.STATUS_META || Object.freeze({
    pending: { note: '等待识别', icon: '' },
    processing: { note: '正在识别', icon: '' },
    auto_reviewing: { note: '正在自动复查', icon: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4.5 8h7" stroke="currentColor" stroke-linecap="round"/></svg>' },
    done: { note: '识别完成', icon: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.5 8.2l3 3 6-6.4" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
    review: { note: '建议检查', icon: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4.5 8h7" stroke="currentColor" stroke-linecap="round"/></svg>' },
    failed: { note: '识别失败，请手动填写或重新上传', icon: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M5 5l6 6M11 5l-6 6" stroke="currentColor" stroke-linecap="round"/></svg>' },
    enhancing: { note: '正在增强识别', icon: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4.5 8h7" stroke="currentColor" stroke-linecap="round"/></svg>' },
    cancelled: { note: '已取消', icon: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4.5 8h7" stroke="currentColor" stroke-linecap="round"/></svg>' }
});

const mapQueueItemToFileStatus = _helpers.mapQueueItemToFileStatus || ((item) => {
    if (!item) return FILE_STATUS.PENDING;
    if (item.displayStatus === FILE_STATUS.ENHANCING) return FILE_STATUS.ENHANCING;
    const raw = typeof item.status === 'string' ? item.status.trim().toLowerCase() : '';
    if (raw === 'cancelled') return FILE_STATUS.CANCELLED;
    if (raw === 'waiting' || raw === 'queued' || raw === 'pending') return FILE_STATUS.PENDING;
    if (raw === 'processing' || raw === 'preparing' || raw === 'uploading' || raw === 'recognizing') return FILE_STATUS.PROCESSING;
    if (raw === 'auto_reviewing' || raw === 'reviewing' || raw === 'high_accuracy') return FILE_STATUS.AUTO_REVIEWING;
    if (raw === 'failed' || raw === 'error') return FILE_STATUS.FAILED;
    if (raw === 'needs_review') return FILE_STATUS.REVIEW;
    if (raw === 'completed' || raw === 'ready') return FILE_STATUS.DONE;
    const rs = typeof item.resultStatus === 'string' ? item.resultStatus.trim().toLowerCase() : '';
    if (rs === 'ready' || rs === 'completed_ready') return FILE_STATUS.DONE;
    if (rs === 'needs_review' || rs === 'review') return FILE_STATUS.REVIEW;
    if (rs === 'failed' || rs === 'error') return FILE_STATUS.FAILED;
    return FILE_STATUS.PENDING;
});

const countBatch = _helpers.countBatch || ((queue) => {
    const statuses = queue.map(item => mapQueueItemToFileStatus(item));
    const terminal = [FILE_STATUS.DONE, FILE_STATUS.REVIEW, FILE_STATUS.FAILED, FILE_STATUS.CANCELLED];
    return {
        done: statuses.filter(s => s === FILE_STATUS.DONE).length,
        review: statuses.filter(s => s === FILE_STATUS.REVIEW).length,
        failed: statuses.filter(s => s === FILE_STATUS.FAILED).length,
        finished: statuses.filter(s => terminal.includes(s)).length,
        total: queue.length
    };
});

const getWorkingTitle = _helpers.getWorkingTitle || ((queue) => {
    if (queue.some(item => mapQueueItemToFileStatus(item) === FILE_STATUS.ENHANCING)) return '增强识别中…';
    if (queue.some(item => mapQueueItemToFileStatus(item) === FILE_STATUS.AUTO_REVIEWING)) return '正在自动复查…';
    return '识别中…';
});

const buildCompleteSummary = _helpers.buildCompleteSummary || ((counts) => {
    const parts = [`${counts.done} 份已完成`];
    if (counts.review > 0) parts.push(`${counts.review} 份建议检查`);
    if (counts.failed > 0) parts.push(`${counts.failed} 份失败`);
    return `${parts.join('，')}。`;
});

const isTerminalFileStatus = _helpers.isTerminalFileStatus || ((status) =>
    [FILE_STATUS.DONE, FILE_STATUS.REVIEW, FILE_STATUS.FAILED, FILE_STATUS.CANCELLED].includes(status)
);

const buildIssueGroup = (title, files, moreTemplate) => {
    const visibleFiles = files.slice(0, ISSUE_LIST_LIMIT);
    const extraCount = files.length - visibleFiles.length;

    return (
        <section className="upload-issue-group" key={title}>
            <p className="upload-issue-title">{title}</p>
            {visibleFiles.map(file => (
                <span className="upload-issue-file" key={file.id || file.name} title={file.name}>
                    • {file.name}
                </span>
            ))}
            {extraCount > 0 && (
                <p className="upload-issue-more">{moreTemplate.replace('*', extraCount)}</p>
            )}
        </section>
    );
};

window.UploadZone = ({
    isDragging,
    handleFiles,
    processingQueue,
    isProcessing,
    isEnhancing = false,
    onDragOver,
    onDragLeave,
    onDrop,
    onCancelAll,
    onCancelItem,
    onEnhanceFailed,
    // Optional parent hook when user clicks「继续上传」. If omitted, beginResetTransition closes the overlay.
    onContinueUpload,
    onWorkspaceIdle
}) => {
    const { Upload, X } = window;
    const { useState, useEffect, useRef, useMemo } = React;

    const [workspaceState, setWorkspaceState] = useState(WORKSPACE_STATE.IDLE);
    const [autoReviewIds, setAutoReviewIds] = useState(() => new Set());
    const overlayTimerRef = useRef(null);
    const resetTimerRef = useRef(null);
    const autoReviewTimersRef = useRef(new Map());

    const clearOverlayTimers = () => {
        if (overlayTimerRef.current) {
            clearTimeout(overlayTimerRef.current);
            overlayTimerRef.current = null;
        }
        if (resetTimerRef.current) {
            clearTimeout(resetTimerRef.current);
            resetTimerRef.current = null;
        }
    };

    const resetWorkspaceVisual = () => {
        clearOverlayTimers();
        setAutoReviewIds(new Set());
        onWorkspaceIdle?.();
        setWorkspaceState(WORKSPACE_STATE.IDLE);
    };

    const beginResetTransition = () => {
        clearOverlayTimers();
        setWorkspaceState(WORKSPACE_STATE.RESETTING);
        resetTimerRef.current = setTimeout(() => {
            resetWorkspaceVisual();
        }, RESULT_TIMING.RESET_TRANSITION_MS);
    };

    const hasQueue = processingQueue.length > 0;

    const displayStatuses = useMemo(
        () => processingQueue.map(item => mapQueueItemToFileStatus(item, autoReviewIds)),
        [processingQueue, autoReviewIds]
    );

    const counts = useMemo(
        () => countBatch(processingQueue, autoReviewIds),
        [processingQueue, autoReviewIds]
    );

    const allTerminal = hasQueue && displayStatuses.every(status => isTerminalFileStatus(status));
    const workingTitle = getWorkingTitle(processingQueue, autoReviewIds, isEnhancing);
    const batchProgress = hasQueue ? Math.round((counts.finished / counts.total) * 100) : 0;

    const reviewFiles = processingQueue.filter(
        item => mapQueueItemToFileStatus(item, autoReviewIds) === FILE_STATUS.REVIEW
    );
    const failedFiles = processingQueue.filter(
        item => mapQueueItemToFileStatus(item, autoReviewIds) === FILE_STATUS.FAILED
    );
    const hasFailure = failedFiles.length > 0;
    const hasReview = reviewFiles.length > 0;

    useEffect(() => () => {
        clearOverlayTimers();
        autoReviewTimersRef.current.forEach(clearTimeout);
        autoReviewTimersRef.current.clear();
    }, []);

    useEffect(() => {
        const timers = autoReviewTimersRef.current;
        const currentIds = new Set();

        processingQueue.forEach(item => {
            currentIds.add(item.id);
            const rawStatus = typeof item.status === 'string' ? item.status.trim().toLowerCase() : '';
            const isActivelyProcessing = rawStatus === 'processing' || rawStatus === 'preparing';

            if (isActivelyProcessing) {
                if (!timers.has(item.id)) {
                    const timer = setTimeout(() => {
                        timers.delete(item.id);
                        setAutoReviewIds(prev => {
                            if (prev.has(item.id)) return prev;
                            const next = new Set(prev);
                            next.add(item.id);
                            return next;
                        });
                    }, RESULT_TIMING.AUTO_REVIEW_AFTER_MS);
                    timers.set(item.id, timer);
                }
                return;
            }

            if (timers.has(item.id)) {
                clearTimeout(timers.get(item.id));
                timers.delete(item.id);
            }
        });

        for (const [id, timer] of [...timers.entries()]) {
            if (!currentIds.has(id)) {
                clearTimeout(timer);
                timers.delete(id);
            }
        }
    }, [processingQueue]);

    useEffect(() => {
        if (!hasQueue) {
            if (workspaceState !== WORKSPACE_STATE.IDLE && workspaceState !== WORKSPACE_STATE.RESETTING) {
                setWorkspaceState(WORKSPACE_STATE.IDLE);
            }
            return;
        }

        if (isEnhancing) {
            if (workspaceState === WORKSPACE_STATE.COMPLETE) {
                clearOverlayTimers();
            }
            if (workspaceState !== WORKSPACE_STATE.ENHANCING) {
                setWorkspaceState(WORKSPACE_STATE.ENHANCING);
            }
            return;
        }

        if (!allTerminal || isProcessing) {
            if (workspaceState === WORKSPACE_STATE.COMPLETE || workspaceState === WORKSPACE_STATE.RESETTING) {
                clearOverlayTimers();
            }
            if (workspaceState !== WORKSPACE_STATE.PROCESSING && workspaceState !== WORKSPACE_STATE.ENHANCING) {
                setWorkspaceState(WORKSPACE_STATE.PROCESSING);
            }
            return;
        }

        if (workspaceState === WORKSPACE_STATE.COMPLETE || workspaceState === WORKSPACE_STATE.RESETTING) {
            return;
        }

        setWorkspaceState(WORKSPACE_STATE.COMPLETE);

        if (!hasFailure) {
            const stayMs = hasReview
                ? RESULT_TIMING.REVIEW_AUTO_DISMISS_MS
                : RESULT_TIMING.SUCCESS_AUTO_DISMISS_MS;
            overlayTimerRef.current = setTimeout(() => {
                beginResetTransition();
            }, stayMs);
        }
    }, [
        hasQueue,
        allTerminal,
        isProcessing,
        isEnhancing,
        hasFailure,
        hasReview,
        workspaceState
    ]);

    const handleContinueClick = () => {
        onContinueUpload?.();
        beginResetTransition();
    };

    const handleEnhanceClick = () => {
        clearOverlayTimers();
        onEnhanceFailed?.();
    };

    const showProcessingLayer = hasQueue && workspaceState !== WORKSPACE_STATE.IDLE;
    const canCancel = isProcessing && !isEnhancing && workspaceState !== WORKSPACE_STATE.COMPLETE;

    return (
        <article
            className={`upload-workspace h-full ${isDragging ? 'drag-active' : ''}`}
            data-workspace-state={hasQueue ? workspaceState : WORKSPACE_STATE.IDLE}
            aria-live="polite"
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
        >
            <div className="upload-idle" aria-hidden={showProcessingLayer}>
                <div className="upload-idle-center">
                    <input
                        type="file"
                        id="fileInput"
                        multiple
                        className="sr-only"
                        accept="image/jpeg,image/png,application/pdf"
                        aria-label="选择发票文件"
                        aria-describedby="invoice-upload-help invoice-upload-privacy"
                        tabIndex={-1}
                        onChange={event => handleFiles(event.target.files)}
                    />
                    <button
                        type="button"
                        className="upload-trigger"
                        onClick={() => document.getElementById('fileInput')?.click()}
                        aria-describedby="invoice-upload-help invoice-upload-privacy"
                    >
                        <span className="upload-icon" aria-hidden="true">
                            {Upload ? <Upload aria-hidden="true" className="upload-icon__glyph" size={28} /> : null}
                        </span>
                        <span id="invoice-upload-title" className="upload-title font-cn">拖入发票，自动整理报销明细</span>
                        <span id="invoice-upload-help" className="upload-format font-cn">支持 JPG、PNG、PDF。</span>
                        <span id="invoice-upload-privacy" className="upload-hint font-cn">
                            单次最多 10 个文件，PDF 默认识别第 1 页。
                        </span>
                    </button>
                </div>
            </div>

            {hasQueue && (
                <div className="upload-processing" aria-hidden={!showProcessingLayer}>
                    <div className="upload-processing-header">
                        <h2 className="upload-working-title font-cn" data-text={workingTitle}>{workingTitle}</h2>
                        {canCancel && (
                            <button
                                type="button"
                                onClick={onCancelAll}
                                className="upload-cancel-all font-cn"
                            >
                                取消全部识别
                            </button>
                        )}
                    </div>

                    <ul className="upload-file-list">
                        {processingQueue.map((item, index) => {
                            const fileStatus = mapQueueItemToFileStatus(item, autoReviewIds);
                            const meta = STATUS_META[fileStatus] || STATUS_META[FILE_STATUS.PENDING];
                            const canCancelItem = ['waiting', 'queued', 'processing', 'preparing'].includes(item.status);

                            return (
                                <li className="upload-file-row" key={item.id} data-status={fileStatus}>
                                    <span className="upload-status-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: meta.icon }} />
                                    <div className="upload-file-main">
                                        <span className="upload-file-name font-en" title={item.name}>{item.name}</span>
                                        <span className="upload-file-note font-cn">{item.note || meta.note}</span>
                                    </div>
                                    {canCancelItem && canCancel && (
                                        <button
                                            type="button"
                                            onClick={event => { event.stopPropagation(); onCancelItem(index); }}
                                            className="upload-item-cancel"
                                            aria-label={`取消 ${item.name} 的识别`}
                                        >
                                            {X ? <X aria-hidden="true" size={12} /> : null}
                                        </button>
                                    )}
                                </li>
                            );
                        })}
                    </ul>

                    <div
                        className="upload-batch-progress-track"
                        role="progressbar"
                        aria-label="批量识别进度"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={batchProgress}
                    >
                        <div
                            className="upload-batch-progress-fill"
                            style={{ '--upload-progress': `${batchProgress}%` }}
                        />
                    </div>
                    <div className="upload-batch-line font-cn tabular-nums" aria-live="polite" aria-atomic="true">
                        {counts.finished} / {counts.total}
                    </div>
                </div>
            )}

            {hasQueue && (
                <div className="upload-complete-overlay" aria-hidden={workspaceState !== WORKSPACE_STATE.COMPLETE && workspaceState !== WORKSPACE_STATE.RESETTING}>
                    <div className="upload-complete-panel">
                        <div className="upload-complete-title font-cn">
                            {hasFailure ? '识别已结束' : '识别完成'}
                        </div>
                        <p className="upload-complete-summary font-cn">
                            {buildCompleteSummary(counts)}
                        </p>
                        {(hasReview || hasFailure) && (
                            <div className="upload-issue-list">
                                {hasReview && buildIssueGroup('建议检查', reviewFiles, '还有 * 个文件建议检查')}
                                {hasFailure && buildIssueGroup('识别失败', failedFiles, '还有 * 个失败文件')}
                            </div>
                        )}
                        {hasFailure && (
                            <div className="upload-complete-actions">
                                <button
                                    type="button"
                                    className="upload-complete-action primary font-cn"
                                    onClick={handleEnhanceClick}
                                >
                                    增强识别失败项
                                </button>
                                <button
                                    type="button"
                                    className="upload-complete-action font-cn"
                                    onClick={handleContinueClick}
                                >
                                    继续上传
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </article>
    );
};
