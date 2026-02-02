window.UploadZone = ({
    isDragging,
    handleFiles,
    processingQueue,
    isProcessing,
    onDragOver,
    onDragLeave,
    onDrop
}) => {
    const { RefreshCw, Upload } = window;
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
                    <p className="text-xs text-gray-500 font-en">支持格式：JPG、PNG、PDF</p>
                </div>
            ) : (
                /* Processing Queue Panel */
                <div className="card-modern rounded-xl p-6 h-full flex flex-col justify-center animate-fade-in border-yellow-400/20 border">
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-sm font-semibold font-cn flex items-center gap-2">
                            <RefreshCw className="animate-spin text-yellow-400" size={16} />
                            处理进度
                        </h3>
                        <span className="text-xs text-gray-500 font-en">{processingQueue.filter(i => i.status === 'completed').length}/{processingQueue.length}</span>
                    </div>

                    <div className="space-y-3 overflow-y-auto custom-scrollbar max-h-[300px] pr-2">
                        {processingQueue.map(item => (
                            <div key={item.id} className="space-y-1.5 animate-slide-in-right">
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-400 font-en truncate max-w-[150px]" title={item.name}>{item.name}</span>
                                    <span className={`font-semibold ${item.status === 'completed' ? 'text-green-400' : item.status === 'failed'
                                        ? 'text-red-400' : 'text-yellow-400'} font-cn flex-shrink-0`}>
                                        {item.status === 'waiting' && '等待中'}
                                        {item.status === 'processing' && '处理中...'}
                                        {item.status === 'completed' && '完成'}
                                        {item.status === 'failed' && '失败'}
                                    </span>
                                </div>
                                <div className="progress-bar h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full transition-all duration-500 ease-out ${item.status === 'failed' ? 'bg-red-500' : 'bg-yellow-400'}`} style={{
                                        width:
                                            `${item.progress}%`
                                    }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
