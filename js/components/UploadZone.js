window.UploadZone = ({
    isDragging,
    handleFiles,
    processingQueue,
    isProcessing,
    onDragOver,
    onDragLeave,
    onDrop,
    onCancelAll,   // New
    onCancelItem   // New
}) => {
    const { RefreshCw, Upload, X } = window;
    const showQueue = processingQueue.length > 0;

    return (
        <div className="h-full relative overflow-hidden rounded-xl">
            {!showQueue ? (
                /* Upload Zone / Drop Area */
                <div className={`upload-zone rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer h-full animate-fade-in
    ${isDragging ? 'drag-active' : ''}`} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
                    onClick={() => document.getElementById('fileInput').click()}
                >
                    <input type="file" id="fileInput" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
                    <div className="w-14 h-14 bg-[#1a1a1a] rounded-full flex items-center justify-center mb-4 transition-transform hover:scale-110 duration-200">
                        {isProcessing ?
                            <RefreshCw className="animate-spin text-yellow-400" size={28} /> :
                            <Upload className="text-yellow-400" size={28} />}
                    </div>
                    <p className="text-sm font-semibold mb-2 font-cn">上传发票</p>
                    <p className="text-xs text-gray-400 mb-1 font-cn">自动识别文字内容填充</p>
                    <p className="text-xs text-gray-500 font-en">支持格式：JPG、PNG、PDF (Max 10)</p>
                </div>
            ) : (
                /* Processing Queue Panel */
                <div className="card-modern rounded-xl p-6 h-full flex flex-col justify-center animate-fade-in border-yellow-400/20 border">
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-sm font-semibold font-cn flex items-center gap-2">
                            <RefreshCw className={`text-yellow-400 ${isProcessing ? 'animate-spin' : ''}`} size={16} />
                            处理进度
                        </h3>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 font-en">{processingQueue.filter(i => i.status === 'completed').length}/{processingQueue.length}</span>
                            {isProcessing && (
                                <button onClick={onCancelAll} className="text-xs text-red-400 hover:text-red-300 font-cn border border-red-400/30 px-2 py-0.5 rounded hover:bg-red-400/10 transition">
                                    全部取消
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="space-y-3 overflow-y-auto custom-scrollbar max-h-[300px] pr-2">
                        {processingQueue.map((item, index) => (
                            <div key={item.id} className="space-y-1.5 animate-slide-in-right group">
                                <div className="flex justify-between text-xs items-center">
                                    <span className="text-gray-400 font-en truncate max-w-[120px]" title={item.name}>{item.name}</span>
                                    <div className="flex items-center gap-2">
                                        <span className={`font-semibold ${item.status === 'completed' ? 'text-green-400' : item.status === 'failed'
                                            ? 'text-red-400' : item.status === 'cancelled' ? 'text-gray-500' : 'text-yellow-400'} font-cn flex-shrink-0`}>
                                            {item.status === 'waiting' && '等待中'}
                                            {item.status === 'processing' && '处理中...'}
                                            {item.status === 'completed' && '完成'}
                                            {item.status === 'failed' && '失败'}
                                            {item.status === 'cancelled' && '已取消'}
                                        </span>
                                        {/* Single Cancel Button (only if processing/waiting) */}
                                        {(item.status === 'waiting' || item.status === 'processing') && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onCancelItem(index); }}
                                                className="hidden group-hover:block p-0.5 hover:bg-[#333] rounded text-gray-500 hover:text-white"
                                                title="取消此项"
                                            >
                                                <X size={12} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="progress-bar h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full ${item.status === 'failed' ? 'bg-red-500' : item.status === 'cancelled' ? 'bg-gray-600' : 'bg-yellow-400'}`}
                                        style={{
                                            width: item.status === 'completed' || item.status === 'failed' ? '100%'
                                                : item.status === 'processing' ? '30%' // Start val for animation
                                                    : `${item.progress}%`,

                                            // Animation when processing
                                            animation: item.status === 'processing' ? 'progress-creep 30s cubic-bezier(0.1, 0.7, 1.0, 0.1) forwards' : 'none',

                                            // Transition for others (clean up)
                                            transition: item.status === 'completed' ? 'width 0.5s ease-out' : 'none'
                                        }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
