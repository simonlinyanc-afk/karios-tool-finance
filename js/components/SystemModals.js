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
        // Quick-start guide reuses the shared HeroModal shell (variant="guide"):
        // short 2x2 steps, no scroll, no fade mask. Seen-flag logic (tutorialCompleted)
        // stays in index.html and is independent from the upgrade modal's key.
        const steps = [
            { title: '填写报销信息', desc: '输入报销人、所属项目、报销日期和收款信息' },
            { title: '上传发票', desc: '支持 JPG、PNG、PDF 格式，上传后自动整理发票信息' },
            { title: '补充凭证', desc: '拖拽上传订单图和支付凭证（可选）' },
            { title: '导出报销单', desc: '一键导出 Excel 或 PDF 格式，图片自动嵌入' }
        ];
        return (
            <window.HeroModal
                isOpen={showTutorial}
                onClose={closeTutorial}
                variant="guide"
                scrollable={false}
                showFadeMask={false}
                heroSrc="assets/guide-welcome-hero.webp"
                heroAlt="欢迎使用 Kairos Finance，快速上手"
                labelId="tutorial-title"
                closeAriaLabel="关闭使用教程"
                primaryActionText="开始使用"
                onPrimaryAction={closeTutorial}
            >
                <h2 id="tutorial-title" className="sr-only">欢迎使用 Kairos Finance 报销单系统 · 快速上手</h2>
                <div className="hero-modal__steps">
                    {steps.map((step, index) => (
                        <div key={index} className="hero-modal__step">
                            <div className="hero-modal__step-index" aria-hidden="true">
                                <span className="font-bold">{index + 1}</span>
                            </div>
                            <div className="hero-modal__step-text">
                                <h3 className="modal-title text-sm font-semibold font-cn mb-0.5">{step.title}</h3>
                                <p className="modal-description text-xs leading-relaxed">{step.desc}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </window.HeroModal>
        );
    },

    DraftRestorePrompt: ({ showDraftPrompt, draftData, handleDiscardDraft, handleRestoreDraft, onDismiss }) => {
        const { Clock } = window;
        const dialogRef = useAccessibleModal(showDraftPrompt, onDismiss);
        if (!showDraftPrompt) return null;
        return (
            <div className="modal-overlay fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in">
                <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="restore-title" tabIndex={-1}
                    className="modal-shell rounded-xl p-6 w-full max-w-sm">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="modal-step-index p-2 rounded-full">
                            <Clock aria-hidden="true" size={20} />
                        </div>
                        <div>
                            <h3 id="restore-title" className="modal-title font-bold font-cn">发现未保存的编辑内容</h3>
                            <p className="modal-subtle text-xs font-cn">可以继续上次的工作</p>
                        </div>
                    </div>
                    <p className="modal-description text-sm mb-6 font-cn leading-relaxed">
                        系统检测到您上次有未完成的编辑，是否恢复？
                        <br />
                        <span className="modal-subtle text-xs mt-1 block">
                            {draftData && new Date(draftData.timestamp).toLocaleString()}
                        </span>
                    </p>
                    <div className="flex gap-3">
                        <button
                            onClick={handleDiscardDraft}
                            className="btn-secondary flex-1 py-2.5 rounded-lg text-sm font-medium font-cn"
                        >
                            丢弃
                        </button>
                        <button
                            onClick={handleRestoreDraft}
                            className="btn-primary flex-1 py-2.5 rounded-lg text-sm font-bold font-cn"
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
            <div className="modal-overlay fixed inset-0 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
                <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="close-project-title" tabIndex={-1}
                    className="modal-shell rounded-xl max-w-sm w-full p-6">
                    <div className="modal-step-index flex items-center justify-center w-12 h-12 rounded-full mb-4 mx-auto">
                        <Briefcase aria-hidden="true" size={24} />
                    </div>
                    <h3 id="close-project-title" className="modal-title text-lg font-bold text-center mb-2 font-cn">确认清空项目</h3>
                    <p className="modal-description text-sm text-center mb-6 font-cn">
                        项目信息尚未完善。清空后当前编辑内容将无法恢复。
                    </p>
                    <div className="flex gap-3">
                        <button type="button"
                            onClick={() => {
                                resetWorkspace();
                                setShowCloseDialog(false);
                            }}
                            className="row-action row-action--danger flex-1 py-2.5 rounded-lg text-sm font-medium font-cn"
                        >
                            确认清空
                        </button>
                        <button type="button"
                            onClick={() => {
                                setShowCloseDialog(false);
                            }}
                            className="btn-primary flex-1 py-2.5 rounded-lg text-sm font-bold font-cn"
                        >
                            前往填写
                        </button>
                    </div>
                </div>
            </div>
        );
    },

    ConfirmDialog: ({ confirmDialog, onCancel, onConfirm }) => {
        const { AlertCircle, Trash2, Check } = window;
        const isOpen = Boolean(confirmDialog?.show);
        const closeDialog = React.useCallback(() => {
            if (confirmDialog?.allowDismiss !== false) {
                onCancel?.();
            }
        }, [confirmDialog?.allowDismiss, onCancel]);
        const dialogRef = useAccessibleModal(isOpen, closeDialog);
        if (!isOpen) return null;

        const variant = confirmDialog.variant || 'default';
        const icon = variant === 'danger'
            ? <Trash2 aria-hidden="true" size={22} />
            : (variant === 'success' ? <Check aria-hidden="true" size={22} /> : <AlertCircle aria-hidden="true" size={22} />);
        const confirmClass = variant === 'danger'
            ? 'row-action row-action--danger'
            : 'btn-primary';

        return (
            <div className="modal-overlay fixed inset-0 backdrop-blur-sm z-[120] flex items-center justify-center p-4 animate-in fade-in duration-200">
                <div
                    ref={dialogRef}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="confirm-dialog-title"
                    aria-describedby="confirm-dialog-description"
                    tabIndex={-1}
                    className="modal-shell rounded-xl max-w-sm w-full p-6"
                >
                    <div className={`modal-step-index confirm-dialog__icon confirm-dialog__icon--${variant} flex items-center justify-center w-12 h-12 rounded-full mb-4 mx-auto`}>
                        {icon}
                    </div>
                    <h3 id="confirm-dialog-title" className="modal-title text-lg font-bold text-center mb-2 font-cn">
                        {confirmDialog.title || '请确认操作'}
                    </h3>
                    <p id="confirm-dialog-description" className="modal-description text-sm text-center mb-6 font-cn leading-relaxed">
                        {confirmDialog.description || '确认后将继续执行此操作。'}
                    </p>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="btn-secondary flex-1 py-2.5 rounded-lg text-sm font-medium font-cn"
                        >
                            {confirmDialog.cancelText || '取消'}
                        </button>
                        <button
                            type="button"
                            onClick={onConfirm}
                            className={`${confirmClass} flex-1 py-2.5 rounded-lg text-sm font-bold font-cn`}
                        >
                            {confirmDialog.confirmText || '确认'}
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
                container: 'toast toast--success',
                iconWrap: 'toast__icon',
                icon: <Check size={14} strokeWidth={3} />
            },
            warning: {
                container: 'toast toast--warning',
                iconWrap: 'toast__icon',
                icon: <RefreshCw size={14} strokeWidth={3} />
            },
            error: {
                container: 'toast toast--error',
                iconWrap: 'toast__icon',
                icon: <X size={14} strokeWidth={3} />
            },
            default: {
                container: 'toast',
                iconWrap: 'toast__icon',
                icon: <Check size={14} strokeWidth={3} />
            }
        };

        const style = variantStyles[toast.variant] || variantStyles.success;

        return (
            <div className="fixed top-6 right-1/2 translate-x-1/2 z-[110] animate-in fade-in slide-in-from-top-4 duration-300" role="status" aria-live="polite" aria-atomic="true">
                <div className={`${style.container} px-6 py-3 rounded-full flex items-center gap-2`}>
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
            <div className="modal-overlay fixed inset-0 z-[100] flex items-center justify-center p-6" onClick={() =>
                setOcrConfirmation({ show: false, itemId: null, file: null, imageUrl: null })}>
                <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="recognition-choice-title" tabIndex={-1}
                    className="modal-shell rounded-xl p-8 max-w-md w-full" onClick={(e) =>
                    e.stopPropagation()}>
                    <h3 id="recognition-choice-title" className="modal-title text-xl font-bold mb-2 font-cn text-center">是否自动整理这张发票？</h3>
                    <p className="modal-description text-xs text-center mb-6">也可以仅保留图片后手动填写</p>
                    {ocrConfirmation.imageUrl && (
                        <div className="mb-6 flex justify-center">
                            <img src={ocrConfirmation.imageUrl} alt="待整理的发票预览" width={320} height={192} className="invoice-thumbnail max-h-48 w-auto rounded object-contain" />
                        </div>
                    )}
                    <div className="flex gap-4">
                        <button type="button" onClick={async () => {
                            const { itemId, file, imageUrl } = ocrConfirmation;
                            setOcrConfirmation({ show: false, itemId: null, file: null, imageUrl: null });
                            if (handlePrimaryImageUpload) {
                                await handlePrimaryImageUpload(itemId, file, { previewUrl: imageUrl });
                            }
                        }} className="btn-primary flex-1 py-3 rounded-lg font-cn font-semibold">开始识别</button>
                        <button type="button" onClick={() => {
                            const { itemId, imageUrl, file } = ocrConfirmation;
                            if (handleManualPrimaryImage) {
                                handleManualPrimaryImage(itemId, file, imageUrl);
                            }
                            setOcrConfirmation({ show: false, itemId: null, file: null, imageUrl: null });
                        }} className="btn-secondary flex-1 py-3 rounded-lg font-cn">仅保留图片</button>
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
            <div className="modal-overlay fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
                <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="export-progress-title" tabIndex={-1}
                    className="modal-shell p-8 rounded-xl w-full max-w-sm relative overflow-hidden animate-fade-in">
                    <h3 id="export-progress-title" className="modal-title text-2xl font-bold font-cn mb-1 tracking-tight">正在导出</h3>
                    <p className="modal-subtle text-xs font-cn tracking-widest mb-6">正在准备导出文件</p>

                    <div className="mb-4">
                        <div className="flex justify-between text-xs font-bold mb-2">
                            <span>{exportProgress.message}</span>
                            <span>{exportProgress.total > 0 ? Math.round((exportProgress.processed / exportProgress.total) * 100) : 0}%</span>
                        </div>
                        <div className="progress-bar h-1 w-full overflow-hidden" role="progressbar" aria-label="导出进度" aria-valuemin={0} aria-valuemax={100}
                            aria-valuenow={exportProgress.total > 0 ? Math.round((exportProgress.processed / exportProgress.total) * 100) : 0}>
                            <div
                                className="progress-fill transition-[width] duration-300 ease-out"
                                style={{ width: `${exportProgress.total > 0 ? (exportProgress.processed / exportProgress.total) * 100 : 0}%` }}
                            ></div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
};
