window.SystemModals = {
    TutorialModal: ({ showTutorial, closeTutorial }) => {
        const { X } = window;
        if (!showTutorial) return null;
        return (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <div className="card-modern rounded-2xl p-8 max-w-2xl w-full relative animate-fade-in">
                    <button onClick={closeTutorial} className="absolute top-4 right-4 text-gray-400 hover:text-white transition">
                        <X size={24} />
                    </button>

                    <div className="text-center mb-6">
                        <div className="w-40 h-15 items-center justify-center mx-auto mb-4 overflow-hidden">
                            <img src="assets/logo.png" alt="Kairos Studio" className="w-full h-full object-contain" />
                        </div>
                        <h2 className="text-2xl font-bold mb-2 font-cn">欢迎使用 Kairos Studio 报销单整理工具</h2>
                        <p className="text-gray-400 text-sm font-en">QUICK START GUIDE</p>
                    </div>

                    <div className="space-y-4 mb-6">
                        <div className="flex gap-4 items-start">
                            <div className="w-8 h-8 bg-yellow-400/10 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                                <span className="text-yellow-400 font-bold">1</span>
                            </div>
                            <div>
                                <h3 className="font-semibold mb-1 font-cn">填写报销信息</h3>
                                <p className="text-sm text-gray-400">输入报销人、所属项目、报销日期和收款信息</p>
                            </div>
                        </div>

                        <div className="flex gap-4 items-start">
                            <div className="w-8 h-8 bg-yellow-400/10 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                                <span className="text-yellow-400 font-bold">2</span>
                            </div>
                            <div>
                                <h3 className="font-semibold mb-1 font-cn">上传发票</h3>
                                <p className="text-sm text-gray-400">支持 JPG、PNG、PDF 格式，OCR 自动识别发票信息</p>
                            </div>
                        </div>

                        <div className="flex gap-4 items-start">
                            <div className="w-8 h-8 bg-yellow-400/10 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                                <span className="text-yellow-400 font-bold">3</span>
                            </div>
                            <div>
                                <h3 className="font-semibold mb-1 font-cn">补充图片</h3>
                                <p className="text-sm text-gray-400">拖拽上传订单图和支付凭证（可选）</p>
                            </div>
                        </div>

                        <div className="flex gap-4 items-start">
                            <div className="w-8 h-8 bg-yellow-400/10 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                                <span className="text-yellow-400 font-bold">4</span>
                            </div>
                            <div>
                                <h3 className="font-semibold mb-1 font-cn">导出报销单</h3>
                                <p className="text-sm text-gray-400">一键导出 Excel 或 PDF 格式，图片自动嵌入</p>
                            </div>
                        </div>
                    </div>

                    <button onClick={closeTutorial} className="w-full btn-primary py-3 rounded-lg font-semibold font-cn">
                        开始使用
                    </button>
                </div>
            </div>
        );
    },

    DraftRestorePrompt: ({ showDraftPrompt, draftData, handleDiscardDraft, handleRestoreDraft }) => {
        const { Clock } = window;
        if (!showDraftPrompt) return null;
        return (
            <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 animate-fade-in">
                <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm border border-gray-100">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="bg-yellow-100 p-2 rounded-full text-yellow-600">
                            <Clock size={20} />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900 font-cn">发现未保存的草稿</h3>
                            <p className="text-xs text-gray-500 font-en">UNSAVED DRAFT FOUND</p>
                        </div>
                    </div>
                    <p className="text-sm text-gray-600 mb-6 font-cn leading-relaxed">
                        系统检测到您上次有未完成的编辑，是否恢复？
                        <br />
                        <span className="text-xs text-gray-400 mt-1 block">
                            {draftData && new Date(draftData.timestamp).toLocaleString()}
                        </span>
                    </p>
                    <div className="flex gap-3">
                        <button
                            onClick={handleDiscardDraft}
                            className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-sm font-medium transition-colors font-cn"
                        >
                            丢弃
                        </button>
                        <button
                            onClick={handleRestoreDraft}
                            className="flex-1 py-2.5 bg-yellow-400 hover:bg-yellow-500 text-black rounded-lg text-sm font-bold shadow-lg shadow-yellow-500/20 transition-colors font-cn"
                        >
                            恢复
                        </button>
                    </div>
                </div>
            </div>
        );
    },

    CloseProjectDialog: ({ showCloseDialog, setShowCloseDialog, resetWorkspace }) => {
        const { Briefcase } = window;
        if (!showCloseDialog) return null;
        return (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                <div className="bg-[#1e1e1e] border border-gray-800 rounded-xl max-w-sm w-full p-6 shadow-2xl">
                    <div className="flex items-center justify-center w-12 h-12 bg-yellow-400/10 rounded-full mb-4 mx-auto">
                        <Briefcase size={24} className="text-yellow-400" />
                    </div>
                    <h3 className="text-lg font-bold text-white text-center mb-2 font-cn">确认清空项目</h3>
                    <p className="text-gray-400 text-sm text-center mb-6 font-cn">
                        检测到项目信息未完善。清空将导致当前进度(Draft)丢失。
                    </p>
                    <div className="flex gap-3">
                        <button
                            onClick={() => {
                                resetWorkspace();
                                setShowCloseDialog(false);
                            }}
                            className="flex-1 py-2.5 bg-transparent border border-gray-700 hover:bg-gray-800 text-gray-400 rounded-lg text-sm font-medium transition-colors font-cn"
                        >
                            确认清空
                        </button>
                        <button
                            onClick={() => {
                                setShowCloseDialog(false);
                            }}
                            className="flex-1 py-2.5 bg-yellow-400 hover:bg-yellow-500 text-black rounded-lg text-sm font-bold shadow-lg shadow-yellow-500/20 transition-colors font-cn"
                        >
                            前往填写
                        </button>
                    </div>
                </div>
            </div>
        );
    },

    ToastNotification: ({ showToast }) => {
        const { Check } = window;
        if (!showToast) return null;
        return (
            <div className="fixed top-6 right-1/2 translate-x-1/2 z-[70] animate-in fade-in slide-in-from-top-4 duration-300">
                <div className="bg-green-500 text-black px-6 py-3 rounded-full shadow-2xl flex items-center gap-2">
                    <div className="bg-black text-green-500 rounded-full p-0.5">
                        <Check size={14} strokeWidth={3} />
                    </div>
                    <span className="font-bold font-cn text-sm tracking-wide">保存成功</span>
                </div>
            </div>
        );
    },

    OcrConfirmationDialog: ({ ocrConfirmation, setOcrConfirmation, updateItem, setIsProcessing }) => {
        if (!ocrConfirmation.show) return null;
        return (
            <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-6" onClick={() =>
                setOcrConfirmation({ show: false, itemId: null, file: null, imageUrl: null })}>
                <div className="bg-[#1a1a1a] rounded-xl p-8 max-w-md w-full border border-[#2a2a2a]" onClick={(e) =>
                    e.stopPropagation()}>
                    <h3 className="text-xl font-bold mb-2 font-cn text-center">是否使用自动识别？</h3>
                    <p className="text-gray-500 text-xs text-center mb-6">Powered by Qwen</p>
                    {ocrConfirmation.imageUrl && (
                        <div className="mb-6 flex justify-center">
                            <img src={ocrConfirmation.imageUrl} alt="Preview" className="max-h-48 rounded border border-[#2a2a2a]" />
                        </div>
                    )}
                    <div className="flex gap-4">
                        <button onClick={async () => {
                            const { itemId, file, imageUrl } = ocrConfirmation;
                            setOcrConfirmation({ show: false, itemId: null, file: null, imageUrl: null });
                            updateItem(itemId, 'previewUrl', imageUrl);
                            updateItem(itemId, 'file', file);
                            setIsProcessing(true);
                            try {
                                const reader = new FileReader();
                                const imageBase64 = await new Promise((resolve, reject) => {
                                    reader.onload = () => resolve(reader.result);
                                    reader.onerror = reject;
                                    reader.readAsDataURL(file);
                                });
                                const response = await fetch('/api/ocr', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ image: imageBase64 })
                                });
                                if (!response.ok) throw new Error('OCR failed');
                                const data = await response.json();

                                if (data) {
                                    Object.entries(data).forEach(([key, value]) => {
                                        if (value !== null && value !== undefined && value !== '') {
                                            updateItem(itemId, key, value);
                                        }
                                    });
                                }
                            } catch (error) {
                                console.error('OCR Error:', error);
                                alert('OCR识别失败：' + error.message);
                            } finally {
                                setIsProcessing(false);
                            }
                        }} className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-black py-3 rounded-lg font-cn font-semibold
          transition">是</button>
                        <button onClick={() => {
                            const { itemId, imageUrl, file } = ocrConfirmation;
                            updateItem(itemId, 'previewUrl', imageUrl);
                            updateItem(itemId, 'file', file);
                            setOcrConfirmation({ show: false, itemId: null, file: null, imageUrl: null });
                        }} className="flex-1 bg-[#2a2a2a] hover:bg-[#3a3a3a] text-gray-300 py-3 rounded-lg font-cn
          transition">否</button>
                    </div>
                </div>
            </div>
        );
    },

    // Add ExportProgressModal if needed (the prompt mentioned "All smaller dialogs")
    // Previous SystemModals had it. I should verify if ExportProgress is small dialog.
    // The prompt listed: TutorialModal, DraftRestorePrompt, CloseProjectDialog, ToastNotification, OcrConfirmationDialog.
    // It did NOT list ExportProgress. But ExportProgress is also a modal.
    // I'll leave it in index.html or move it? 
    // Wait, the prompt said "Extract: The complex ExportPreviewModal...".
    // I'll assume ExportProgress (the Swiss style one) stays or I should put it in SystemModals too?
    // User said "All smaller dialogs". ExportProgress is a small dialog. I'll add it to SystemModals.
    ExportProgressModal: ({ exportProgress }) => {
        if (!exportProgress.show) return null;
        return (
            <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm transition-all duration-300">
                <div className="bg-white text-black p-8 rounded-none w-full max-w-sm shadow-2xl relative overflow-hidden animate-fade-in border-l-4 border-yellow-500">
                    <h3 className="text-2xl font-bold font-cn mb-1 tracking-tight">正在导出</h3>
                    <p className="text-xs text-gray-500 font-en uppercase tracking-widest mb-6">Processing Request</p>

                    <div className="mb-4">
                        <div className="flex justify-between text-xs font-bold mb-2">
                            <span>{exportProgress.message}</span>
                            <span>{exportProgress.total > 0 ? Math.round((exportProgress.processed / exportProgress.total) * 100) : 0}%</span>
                        </div>
                        <div className="h-1 w-full bg-gray-100 overflow-hidden">
                            <div
                                className="h-full bg-yellow-500 transition-all duration-300 ease-out"
                                style={{ width: `${exportProgress.total > 0 ? (exportProgress.processed / exportProgress.total) * 100 : 0}%` }}
                            ></div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
};
