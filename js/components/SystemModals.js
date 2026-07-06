const FOCUSABLE_MODAL_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const useAccessibleModal = (isOpen, onClose) => {
    const dialogRef = React.useRef(null);
    const previousFocusRef = React.useRef(null);

    React.useEffect(() => {
        if (!isOpen) return undefined;
        previousFocusRef.current = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const handleKeyDown = event => {
            if (event.key === 'Escape' && onClose) {
                event.preventDefault();
                onClose();
                return;
            }
            if (event.key !== 'Tab') return;
            const focusable = dialogRef.current?.querySelectorAll(FOCUSABLE_MODAL_SELECTOR);
            if (!focusable?.length) {
                event.preventDefault();
                dialogRef.current?.focus?.();
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (!dialogRef.current?.contains(document.activeElement)) {
                event.preventDefault();
                (event.shiftKey ? last : first).focus();
                return;
            }
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        setTimeout(() => {
            const firstControl = dialogRef.current?.querySelector(FOCUSABLE_MODAL_SELECTOR);
            (firstControl || dialogRef.current)?.focus?.();
        }, 0);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = previousOverflow;
            previousFocusRef.current?.focus?.();
        };
    }, [isOpen, onClose]);

    return dialogRef;
};

window.useModalAccessibility = useAccessibleModal;

window.SystemModals = {
    TutorialModal: ({ showTutorial, closeTutorial }) => {
        const { X } = window;
        const dialogRef = useAccessibleModal(showTutorial, closeTutorial);
        if (!showTutorial) return null;
        return (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
                <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="tutorial-title" tabIndex={-1}
                    className="card-modern rounded-2xl p-8 max-w-2xl w-full relative animate-fade-in overscroll-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400">
                    <button type="button" onClick={closeTutorial} aria-label="关闭使用教程"
                        className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400">
                        <X aria-hidden="true" size={24} />
                    </button>

                    <div className="text-center mb-6">
                        <div className="w-40 h-15 items-center justify-center mx-auto mb-4 overflow-hidden">
                            <img src="assets/Kairos Logo.svg" alt="Kairos Logo" width={160} height={60} className="w-full h-full object-contain" />
                        </div>
                        <h2 id="tutorial-title" className="text-2xl font-bold mb-2 font-cn">欢迎使用 Kairos Finance·黄鸟报销单系统</h2>
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
                                <p className="text-sm text-gray-400">支持 JPG、PNG、PDF 格式，上传后自动整理发票信息</p>
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

                    <button type="button" onClick={closeTutorial} className="w-full btn-primary py-3 rounded-lg font-semibold font-cn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400">
                        开始使用
                    </button>
                </div>
            </div>
        );
    },

    DraftRestorePrompt: ({ showDraftPrompt, draftData, handleDiscardDraft, handleRestoreDraft, onDismiss }) => {
        const { Clock } = window;
        const dialogRef = useAccessibleModal(showDraftPrompt, onDismiss);
        if (!showDraftPrompt) return null;
        return (
            <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 animate-fade-in">
                <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="restore-title" tabIndex={-1}
                    className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm border border-gray-100 overscroll-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="bg-yellow-100 p-2 rounded-full text-yellow-600">
                            <Clock aria-hidden="true" size={20} />
                        </div>
                        <div>
                            <h3 id="restore-title" className="font-bold text-gray-900 font-cn">发现未保存的编辑内容</h3>
                            <p className="text-xs text-gray-500 font-cn">可以继续上次的工作</p>
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
        const closeDialog = React.useCallback(() => setShowCloseDialog(false), [setShowCloseDialog]);
        const dialogRef = useAccessibleModal(showCloseDialog, closeDialog);
        if (!showCloseDialog) return null;
        return (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
                <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="close-project-title" tabIndex={-1}
                    className="bg-[#1e1e1e] border border-gray-800 rounded-xl max-w-sm w-full p-6 shadow-2xl overscroll-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400">
                    <div className="flex items-center justify-center w-12 h-12 bg-yellow-400/10 rounded-full mb-4 mx-auto">
                        <Briefcase aria-hidden="true" size={24} className="text-yellow-400" />
                    </div>
                    <h3 id="close-project-title" className="text-lg font-bold text-white text-center mb-2 font-cn">确认清空项目</h3>
                    <p className="text-gray-400 text-sm text-center mb-6 font-cn">
                        项目信息尚未完善。清空后当前编辑内容将无法恢复。
                    </p>
                    <div className="flex gap-3">
                        <button type="button"
                            onClick={() => {
                                resetWorkspace();
                                setShowCloseDialog(false);
                            }}
                            className="flex-1 py-2.5 bg-transparent border border-gray-700 hover:bg-gray-800 text-gray-400 rounded-lg text-sm font-medium transition-colors font-cn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                        >
                            确认清空
                        </button>
                        <button type="button"
                            onClick={() => {
                                setShowCloseDialog(false);
                            }}
                            className="flex-1 py-2.5 bg-yellow-400 hover:bg-yellow-500 text-black rounded-lg text-sm font-bold shadow-lg shadow-yellow-500/20 transition-colors font-cn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400"
                        >
                            前往填写
                        </button>
                    </div>
                </div>
            </div>
        );
    },

    ToastNotification: ({ showToast }) => {
        const { Check, RefreshCw, X } = window;
        const toast = typeof showToast === 'object'
            ? showToast
            : { show: Boolean(showToast), message: '保存成功', variant: 'success' };

        if (!toast.show) return null;

        const variantStyles = {
            success: {
                container: 'bg-green-500 text-black',
                iconWrap: 'bg-black text-green-500',
                icon: <Check size={14} strokeWidth={3} />
            },
            warning: {
                container: 'bg-yellow-400 text-black',
                iconWrap: 'bg-black text-yellow-400',
                icon: <RefreshCw size={14} strokeWidth={3} />
            },
            error: {
                container: 'bg-red-500 text-white',
                iconWrap: 'bg-black text-red-400',
                icon: <X size={14} strokeWidth={3} />
            },
            default: {
                container: 'bg-white text-black',
                iconWrap: 'bg-black text-white',
                icon: <Check size={14} strokeWidth={3} />
            }
        };

        const style = variantStyles[toast.variant] || variantStyles.success;

        return (
            <div className="fixed top-6 right-1/2 translate-x-1/2 z-[110] animate-in fade-in slide-in-from-top-4 duration-300" role="status" aria-live="polite" aria-atomic="true">
                <div className={`${style.container} px-6 py-3 rounded-full shadow-2xl flex items-center gap-2`}>
                    <div className={`${style.iconWrap} rounded-full p-0.5`}>
                        {style.icon}
                    </div>
                    <span className="font-bold font-cn text-sm tracking-wide">{toast.message || '保存成功'}</span>
                </div>
            </div>
        );
    },

    OcrConfirmationDialog: ({ ocrConfirmation, setOcrConfirmation, handlePrimaryImageUpload, handleManualPrimaryImage }) => {
        const closeDialog = React.useCallback(() => {
            setOcrConfirmation({ show: false, itemId: null, file: null, imageUrl: null });
        }, [setOcrConfirmation]);
        const dialogRef = useAccessibleModal(ocrConfirmation.show, closeDialog);
        if (!ocrConfirmation.show) return null;
        return (
            <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-6" onClick={() =>
                setOcrConfirmation({ show: false, itemId: null, file: null, imageUrl: null })}>
                <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="recognition-choice-title" tabIndex={-1}
                    className="bg-[#1a1a1a] rounded-xl p-8 max-w-md w-full border border-[#2a2a2a] overscroll-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400" onClick={(e) =>
                    e.stopPropagation()}>
                    <h3 id="recognition-choice-title" className="text-xl font-bold mb-2 font-cn text-center">是否自动整理这张发票？</h3>
                    <p className="text-gray-500 text-xs text-center mb-6">也可以仅保留图片后手动填写</p>
                    {ocrConfirmation.imageUrl && (
                        <div className="mb-6 flex justify-center">
                            <img src={ocrConfirmation.imageUrl} alt="待整理的发票预览" width={320} height={192} className="max-h-48 w-auto rounded border border-[#2a2a2a] object-contain" />
                        </div>
                    )}
                    <div className="flex gap-4">
                        <button type="button" onClick={async () => {
                            const { itemId, file, imageUrl } = ocrConfirmation;
                            setOcrConfirmation({ show: false, itemId: null, file: null, imageUrl: null });
                            if (handlePrimaryImageUpload) {
                                await handlePrimaryImageUpload(itemId, file, { previewUrl: imageUrl });
                            }
                        }} className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-black py-3 rounded-lg font-cn font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400">开始识别</button>
                        <button type="button" onClick={() => {
                            const { itemId, imageUrl, file } = ocrConfirmation;
                            if (handleManualPrimaryImage) {
                                handleManualPrimaryImage(itemId, file, imageUrl);
                            }
                            setOcrConfirmation({ show: false, itemId: null, file: null, imageUrl: null });
                        }} className="flex-1 bg-[#2a2a2a] hover:bg-[#3a3a3a] text-gray-300 py-3 rounded-lg font-cn transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400">仅保留图片</button>
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
        const dialogRef = useAccessibleModal(exportProgress.show, null);
        if (!exportProgress.show) return null;
        return (
            <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
                <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="export-progress-title" tabIndex={-1}
                    className="bg-white text-black p-8 rounded-none w-full max-w-sm shadow-2xl relative overflow-hidden animate-fade-in border-l-4 border-yellow-500 overscroll-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500">
                    <h3 id="export-progress-title" className="text-2xl font-bold font-cn mb-1 tracking-tight">正在导出</h3>
                    <p className="text-xs text-gray-500 font-cn tracking-widest mb-6">正在准备导出文件</p>

                    <div className="mb-4">
                        <div className="flex justify-between text-xs font-bold mb-2">
                            <span>{exportProgress.message}</span>
                            <span>{exportProgress.total > 0 ? Math.round((exportProgress.processed / exportProgress.total) * 100) : 0}%</span>
                        </div>
                        <div className="h-1 w-full bg-gray-100 overflow-hidden" role="progressbar" aria-label="导出进度" aria-valuemin={0} aria-valuemax={100}
                            aria-valuenow={exportProgress.total > 0 ? Math.round((exportProgress.processed / exportProgress.total) * 100) : 0}>
                            <div
                                className="h-full bg-yellow-500 transition-[width] duration-300 ease-out"
                                style={{ width: `${exportProgress.total > 0 ? (exportProgress.processed / exportProgress.total) * 100 : 0}%` }}
                            ></div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
};
