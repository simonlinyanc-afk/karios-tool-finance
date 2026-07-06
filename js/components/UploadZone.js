const uploadStatusLabels = {
    waiting: '等待识别',
    queued: '等待识别',
    preparing: '正在准备图片',
    processing: '正在识别',
    completed: '已完成',
    ready: '已完成',
    needs_review: '建议检查',
    failed: '识别失败',
    cancelled: '已取消'
};

const getUploadStatusLabel = item => uploadStatusLabels[item.resultStatus || item.status] || '等待识别';

window.UploadZone = ({
    isDragging,
    handleFiles,
    processingQueue,
    isProcessing,
    onDragOver,
    onDragLeave,
    onDrop,
    onCancelAll,
    onCancelItem
}) => {
    const { RefreshCw, Upload, X } = window;
    const showQueue = processingQueue.length > 0;
    const summary = processingQueue.reduce((result, item) => {
        const status = item.resultStatus || item.status;
        if (status === 'completed' || status === 'ready') result.completed += 1;
        if (status === 'needs_review') result.needsReview += 1;
        if (status === 'failed') result.failed += 1;
        return result;
    }, { completed: 0, needsReview: 0, failed: 0 });

    return (
        <section className="h-full relative overflow-hidden rounded-xl" aria-labelledby="invoice-upload-title">
            {!showQueue ? (
                <div
                    className={`upload-zone rounded-xl p-8 flex flex-col items-center justify-center text-center h-full ${isDragging ? 'drag-active' : ''}`}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                >
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
                        className="group w-full h-full flex flex-col items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111]"
                        onClick={() => document.getElementById('fileInput')?.click()}
                        aria-describedby="invoice-upload-help invoice-upload-privacy"
                    >
                        <span className="w-14 h-14 bg-[#1a1a1a] rounded-full flex items-center justify-center mb-4 transition-transform group-hover:scale-105">
                            {isProcessing
                                ? <RefreshCw aria-hidden="true" className="motion-spin text-yellow-400" size={28} />
                                : <Upload aria-hidden="true" className="text-yellow-400" size={28} />}
                        </span>
                        <span id="invoice-upload-title" className="text-sm font-semibold mb-2 font-cn">拖入发票，自动整理报销明细</span>
                        <span id="invoice-upload-help" className="text-xs text-gray-400 mb-2 font-cn">
                            支持 JPG、PNG、PDF。单次最多 10 个文件，PDF 默认识别第 1 页。
                        </span>
                        <span id="invoice-upload-privacy" className="text-xs text-gray-500 font-cn leading-relaxed">
                            系统会先在浏览器中压缩图片，再发送用于识别；原始文件不会保存在服务器。
                        </span>
                    </button>
                </div>
            ) : (
                <div className="card-modern rounded-xl p-6 h-full flex flex-col justify-center border-yellow-400/20 border">
                    <div className="mb-4 flex items-start justify-between gap-4">
                        <div>
                            <h3 className="text-sm font-semibold font-cn flex items-center gap-2">
                                <RefreshCw aria-hidden="true" className={`text-yellow-400 ${isProcessing ? 'motion-spin' : ''}`} size={16} />
                                批量识别进度
                            </h3>
                            <p className="mt-2 text-xs text-gray-400 font-cn tabular-nums" aria-live="polite" aria-atomic="true">
                                本批次 {processingQueue.length} 张发票 · 已完成 {summary.completed} · 建议检查 {summary.needsReview} · 识别失败 {summary.failed}
                            </p>
                        </div>
                        {isProcessing && (
                            <button
                                type="button"
                                onClick={onCancelAll}
                                className="text-xs text-red-400 hover:text-red-300 font-cn border border-red-400/30 px-2 py-1 rounded hover:bg-red-400/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                            >
                                取消全部识别
                            </button>
                        )}
                    </div>

                    <div className="space-y-3 overflow-y-auto custom-scrollbar max-h-[300px] pr-2">
                        {processingQueue.map((item, index) => {
                            const status = item.resultStatus || item.status;
                            const isFinished = ['completed', 'ready', 'needs_review', 'failed'].includes(status);
                            const progress = isFinished ? 100 : status === 'processing' ? Math.max(30, item.progress || 0) : item.progress || 0;
                            return (
                                <div key={item.id} className="space-y-1.5 queue-item">
                                    <div className="flex justify-between text-xs items-center gap-3">
                                        <span className="text-gray-400 font-en truncate min-w-0" title={item.name}>{item.name}</span>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className={`font-semibold font-cn ${status === 'failed' ? 'text-red-400' : status === 'cancelled' ? 'text-gray-500' : status === 'needs_review' ? 'text-yellow-200' : status === 'completed' || status === 'ready' ? 'text-green-400' : 'text-yellow-400'}`}>
                                                {getUploadStatusLabel(item)}
                                            </span>
                                            {(item.status === 'waiting' || item.status === 'queued' || item.status === 'processing') && (
                                                <button
                                                    type="button"
                                                    onClick={event => { event.stopPropagation(); onCancelItem(index); }}
                                                    className="p-1 hover:bg-[#333] rounded text-gray-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400"
                                                    aria-label={`取消 ${item.name} 的识别`}
                                                >
                                                    <X aria-hidden="true" size={12} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <div
                                        className="progress-bar h-1.5 bg-gray-800 rounded-full overflow-hidden"
                                        role="progressbar"
                                        aria-label={`${item.name} 识别进度`}
                                        aria-valuemin={0}
                                        aria-valuemax={100}
                                        aria-valuenow={progress}
                                    >
                                        <div
                                            className={`queue-progress-fill h-full rounded-full ${status === 'processing' ? 'queue-progress-active' : ''} ${status === 'failed' ? 'bg-red-500' : status === 'cancelled' ? 'bg-gray-600' : 'bg-yellow-400'}`}
                                            style={{ width: `${progress}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </section>
    );
};
