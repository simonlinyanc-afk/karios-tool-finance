window.ExportPreviewModal = ({
    showExportPreview,
    setShowExportPreview,
    previewTab,
    setPreviewTab,
    reimbursementInfo,
    columns,
    setColumns,
    items
}) => {
    const { Settings, Eye, FileText, Briefcase, X, Download, ChevronRight, AlertCircle, ZoomIn, ZoomOut, Maximize } = window;
    const { PDFTemplate } = window;
    const [showCheckDetails, setShowCheckDetails] = React.useState(false);
    const [showColumnSettings, setShowColumnSettings] = React.useState(() => {
        if (!window.matchMedia) return true;
        return !window.matchMedia('(max-width: 900px)').matches;
    });
    const [previewZoom, setPreviewZoom] = React.useState(1);
    const previewViewportRef = React.useRef(null);
    const previewStageRef = React.useRef(null);
    const closeExportPreview = React.useCallback(() => setShowExportPreview(false), [setShowExportPreview]);
    const dialogRef = window.useModalAccessibility(showExportPreview, closeExportPreview);
    const exportReadiness = window.getExportReadiness ? window.getExportReadiness(items) : null;
    const visibleIssues = exportReadiness?.issues.slice(0, 12) || [];
    const shouldShowZoomToolbar = !showColumnSettings && !showCheckDetails;
    const visibleExportColumns = React.useMemo(
        () => columns.filter(c => c.visible && c.id !== 'actions'),
        [columns]
    );

    const setZoomClamped = React.useCallback(nextZoom => {
        const normalized = typeof nextZoom === 'function' ? nextZoom(previewZoom) : nextZoom;
        setPreviewZoom(Math.min(2, Math.max(0.5, Number(normalized.toFixed(2)))));
    }, [previewZoom]);

    const fitPreviewWidth = React.useCallback(() => {
        const viewportWidth = previewViewportRef.current?.clientWidth || 0;
        const stageWidth = previewStageRef.current?.offsetWidth || 0;
        if (!viewportWidth || !stageWidth) {
            setPreviewZoom(1);
            return;
        }
        const nextZoom = Math.min(1.5, Math.max(0.5, (viewportWidth - 64) / stageWidth));
        setPreviewZoom(Number(nextZoom.toFixed(2)));
    }, []);

    const warningLabels = [
        { key: 'missing_date', label: '缺少日期' },
        { key: 'missing_amount', label: '缺少金额' },
        { key: 'missing_description', label: '缺少摘要说明' },
        { key: 'ocr_failed', label: '识别失败' }
    ];

    if (!showExportPreview) return null;

    return (
        <div
            className="modal-overlay fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in"
            onClick={() => setShowExportPreview(false)}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="export-preview-title"
                tabIndex={-1}
                className="export-preview-shell rounded-xl w-full max-w-7xl h-[90vh] flex flex-col overflow-hidden overscroll-contain"
                onClick={e => e.stopPropagation()}
            >
                <div className="export-preview-header flex flex-col gap-3 border-b px-5 py-4 pr-16 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 flex-wrap items-center gap-4">
                        <h3 id="export-preview-title" className="modal-title font-bold font-cn text-lg flex items-center gap-2">
                            <Eye aria-hidden="true" size={18} />
                            导出预览
                        </h3>
                        <div className="export-tab-list flex rounded-lg p-1">
                            <button
                                type="button"
                                onClick={() => setPreviewTab('excel')}
                                className={`export-tab px-4 py-1.5 text-xs rounded-md transition font-medium flex items-center gap-2 ${previewTab === 'excel' ? 'is-active shadow-sm' : ''}`}
                                aria-pressed={previewTab === 'excel'}
                            >
                                <FileText aria-hidden="true" size={14} /> Excel 预览
                            </button>
                            <button
                                type="button"
                                onClick={() => setPreviewTab('pdf')}
                                className={`export-tab px-4 py-1.5 text-xs rounded-md transition font-medium flex items-center gap-2 ${previewTab === 'pdf' ? 'is-active shadow-sm' : ''}`}
                                aria-pressed={previewTab === 'pdf'}
                            >
                                <Briefcase aria-hidden="true" size={14} /> PDF 打印预览
                            </button>
                        </div>
                    </div>
                    <button type="button" onClick={() => setShowExportPreview(false)} aria-label="关闭导出预览"
                        className="modal-close export-preview-close rounded-full p-2">
                        <X aria-hidden="true" size={18} />
                    </button>
                </div>

                {exportReadiness && (
                    <div className="export-compact-summary flex flex-col gap-3 px-5 py-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex min-w-0 items-center gap-2">
                            <AlertCircle aria-hidden="true" size={16} className={exportReadiness.hasIssues ? 'status-badge--review' : 'status-badge--ready'} />
                            <div className="min-w-0">
                                <div className="modal-title text-sm font-semibold font-cn">导出前检查</div>
                                <p className="modal-subtle text-xs font-cn truncate">
                                    {exportReadiness.hasIssues
                                        ? `还有 ${exportReadiness.needsReviewCount} 条发票建议检查，${exportReadiness.failedCount} 条识别失败。`
                                        : '当前条目已完成，导出前建议再快速检查金额和发票号码。'}
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                            <span className="status-badge status-badge--ready px-3 py-1 rounded-full text-xs font-cn">已完成 {exportReadiness.readyCount}</span>
                            <span className="status-badge status-badge--review px-3 py-1 rounded-full text-xs font-cn">建议检查 {exportReadiness.needsReviewCount}</span>
                            <span className="status-badge status-badge--failed px-3 py-1 rounded-full text-xs font-cn" aria-label="查看失败项">识别失败 {exportReadiness.failedCount}</span>
                            <button
                                type="button"
                                onClick={() => setShowColumnSettings(current => !current)}
                                className="row-action inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs"
                                aria-expanded={showColumnSettings}
                                aria-controls="export-column-settings"
                            >
                                <Settings aria-hidden="true" size={14} />
                                {showColumnSettings ? '收起列设置' : '列设置'}
                            </button>
                            {exportReadiness.hasIssues && (
                                <button
                                    type="button"
                                    onClick={() => setShowCheckDetails(current => !current)}
                                    className="row-action inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs"
                                    aria-expanded={showCheckDetails}
                                    aria-controls="export-checklist"
                                    aria-label={showCheckDetails ? '收起检查清单' : '先去检查：展开检查清单'}
                                >
                                    <span>{showCheckDetails ? '收起检查清单' : '检查清单'}</span>
                                    <ChevronRight aria-hidden="true" size={14} className={`transition-transform ${showCheckDetails ? 'rotate-180' : ''}`} />
                                </button>
                            )}
                        </div>
                    </div>
                )}

                <div className="export-preview-body relative flex flex-1 overflow-hidden">
                    <div className="export-preview-sidebar-rail flex shrink-0 flex-col items-center gap-2 px-2 py-3">
                        <button
                            type="button"
                            onClick={() => setShowColumnSettings(current => !current)}
                            className="modal-close rounded-lg p-2"
                            aria-label={showColumnSettings ? '收起列设置' : '展开列设置'}
                            aria-expanded={showColumnSettings}
                        >
                            <Settings aria-hidden="true" size={16} />
                        </button>
                    </div>

                    <aside
                        id="export-column-settings"
                        className={`export-preview-sidebar border-r flex shrink-0 flex-col ${showColumnSettings ? '' : 'is-collapsed'}`}
                        aria-label="导出列设置"
                    >
                        <div className="flex items-start justify-between gap-3 border-b modal-divider p-4">
                            <div>
                                <h4 className="modal-title font-bold font-cn text-sm">导出列设置</h4>
                                <p className="modal-subtle text-xs mt-1">勾选以包含在导出文件中</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowColumnSettings(false)}
                                className="modal-close rounded-full p-1.5"
                                aria-label="收起列设置"
                            >
                                <X aria-hidden="true" size={14} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                            {columns.map(col => (
                                <label key={col.id} className={`column-option flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition ${col.visible ? 'is-visible' : 'opacity-70 hover:opacity-100'}`}>
                                    <input
                                        type="checkbox"
                                        checked={col.visible}
                                        disabled={col.fixed}
                                        onChange={() => {
                                            if (col.fixed) return;
                                            setColumns(cols => cols.map(c =>
                                                c.id === col.id ? { ...c, visible: !c.visible } : c
                                            ));
                                        }}
                                        className={`w-4 h-4 rounded ${col.fixed ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                    />
                                    <span className="text-sm font-medium flex-1">{col.label}</span>
                                    {col.fixed && <span className="fixed-column-badge text-[10px] px-1.5 py-0.5 rounded">必选</span>}
                                </label>
                            ))}
                        </div>
                    </aside>

                    <main className="export-preview-canvas relative flex min-w-0 flex-1 flex-col">
                        {shouldShowZoomToolbar && (
                            <div className="preview-zoom-toolbar absolute left-1/2 top-4 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full px-2 py-1">
                                <button
                                    type="button"
                                    onClick={() => setZoomClamped(current => current - 0.1)}
                                    className="btn-ghost preview-zoom-button rounded-full px-2 py-1 text-xs"
                                    aria-label="缩小预览"
                                >
                                    <ZoomOut aria-hidden="true" size={14} />
                                    <span className="sr-only">缩小</span>
                                </button>
                                <span className="preview-zoom-value min-w-[3.25rem] text-center text-xs font-semibold">{Math.round(previewZoom * 100)}%</span>
                                <button
                                    type="button"
                                    onClick={() => setZoomClamped(current => current + 0.1)}
                                    className="btn-ghost preview-zoom-button rounded-full px-2 py-1 text-xs"
                                    aria-label="放大预览"
                                >
                                    <ZoomIn aria-hidden="true" size={14} />
                                    <span className="sr-only">放大</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={fitPreviewWidth}
                                    className="btn-ghost preview-zoom-button rounded-full px-3 py-1 text-xs"
                                    aria-label="适应宽度"
                                >
                                    <Maximize aria-hidden="true" size={14} />
                                    <span>适应宽度</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPreviewZoom(1)}
                                    className="btn-ghost preview-zoom-button rounded-full px-3 py-1 text-xs"
                                    aria-label="实际大小"
                                >
                                    实际大小
                                </button>
                            </div>
                        )}

                        <div ref={previewViewportRef} className="flex-1 overflow-auto p-8 pt-16 custom-scrollbar">
                            <div className="flex min-h-full justify-center">
                                <div
                                    ref={previewStageRef}
                                    className="preview-zoom-stage"
                                    style={{ transform: `scale(${previewZoom})` }}
                                >
                                    {previewTab === 'excel' ? (
                                        <div className="export-preview-paper p-10 min-h-full w-[960px] max-w-[960px] overflow-x-auto">
                                            <div className="excel-preview-header flex justify-between items-end mb-8 pb-4">
                                                <h1 className="excel-preview-title text-3xl font-bold">报销单 (Excel 预览)</h1>
                                                <div className="excel-preview-meta text-right text-xs">
                                                    <p className="mb-1"><span className="font-bold">报销人:</span> {reimbursementInfo.reimburser || '-'}</p>
                                                    <p className="mb-1"><span className="font-bold">项目:</span> {reimbursementInfo.project || '-'}</p>
                                                    <p className="mb-1"><span className="font-bold">日期:</span> {reimbursementInfo.reimbursementDate || '-'}</p>
                                                    <p><span className="font-bold">打款信息:</span> {reimbursementInfo.paymentInfo || '-'}</p>
                                                </div>
                                            </div>
                                            <table className="excel-preview-table w-full border-collapse text-xs table-fixed">
                                                <thead>
                                                    <tr>
                                                        {visibleExportColumns.map(col => (
                                                            <th key={col.id} className="p-2 text-left font-bold">{col.label}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {items.map((item, idx) => (
                                                        <tr key={item.id} className={idx % 2 === 0 ? '' : 'excel-preview-row-alt'}>
                                                            {visibleExportColumns.map(col => (
                                                                <td key={col.id} className="p-2 text-left truncate max-w-[150px]" title={typeof item[col.id] === 'string' ? item[col.id] : ''}>
                                                                    {['preview', 'orderImage', 'paymentProof', 'attachments'].includes(col.id) ? (
                                                                        (() => {
                                                                            if (col.id === 'attachments') {
                                                                                const val = item[col.id];
                                                                                const images = Array.isArray(val) ? val : (val && typeof val === 'string' ? [val] : []);
                                                                                return images.length > 0 ? (
                                                                                    <div className="flex gap-1 flex-wrap">
                                                                                        {images.map((url, i) => (
                                                                                            <img key={i} src={url} width={40} height={40} alt={`附件 ${i + 1}`} className="h-10 w-10 object-cover rounded" />
                                                                                        ))}
                                                                                    </div>
                                                                                ) : <span className="excel-preview-empty">-</span>;
                                                                            }

                                                                            let url = null;
                                                                            if (col.id === 'preview') url = item.previewUrl || item.preview;
                                                                            else if (col.id === 'orderImage') url = item.orderImageUrl || item.orderImage;
                                                                            else if (col.id === 'paymentProof') url = item.paymentProofUrl || item.paymentProof;

                                                                            return url ? (
                                                                                <img src={url} width={40} height={40} alt={col.label} className="h-10 w-10 object-cover rounded" />
                                                                            ) : <span className="excel-preview-empty">-</span>;
                                                                        })()
                                                                    ) : (
                                                                        item[col.id]
                                                                    )}
                                                                </td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                                <tfoot>
                                                    <tr className="font-bold">
                                                        <td colSpan={Math.max(visibleExportColumns.length - 1, 1)} className="p-2 text-right">总计:</td>
                                                        <td className="p-2 text-left">¥{formatCurrency(items.reduce((sum, item) => sum + Number(item.amount || 0), 0))}</td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="export-preview-paper p-8">
                                            <PDFTemplate items={items} reimbursementInfo={reimbursementInfo} columns={columns} />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {exportReadiness?.hasIssues && (
                            <>
                                {showCheckDetails && (
                                    <button
                                        type="button"
                                        className="export-side-backdrop absolute inset-0"
                                        onClick={() => setShowCheckDetails(false)}
                                        aria-label="关闭检查清单"
                                    />
                                )}
                                <aside
                                    id="export-checklist"
                                    className={`export-side-panel absolute top-0 right-0 h-full w-full max-w-[360px] border-l transition-transform duration-300 ${
                                        showCheckDetails ? 'translate-x-0' : 'translate-x-full'
                                    }`}
                                    aria-label="导出前检查清单"
                                    aria-hidden={!showCheckDetails}
                                >
                                    <div className="flex h-full flex-col">
                                        <div className="flex items-start justify-between gap-4 border-b modal-divider px-5 py-4">
                                            <div>
                                                <div className="modal-title text-sm font-semibold font-cn">检查清单</div>
                                                <p className="modal-subtle text-xs mt-1 font-cn">仅列出需要你补充或确认的条目。</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setShowCheckDetails(false)}
                                                className="modal-close rounded-full p-2"
                                                aria-label="关闭检查清单"
                                            >
                                                <X aria-hidden="true" size={16} />
                                            </button>
                                        </div>

                                        <div className="flex flex-wrap gap-2 border-b modal-divider px-5 py-4">
                                            <span className="status-badge status-badge--review px-3 py-1 rounded-full text-xs font-cn">建议检查 {exportReadiness.needsReviewCount}</span>
                                            <span className="status-badge status-badge--failed px-3 py-1 rounded-full text-xs font-cn">识别失败 {exportReadiness.failedCount}</span>
                                        </div>

                                        <div className="flex-1 overflow-y-auto px-4 py-4 custom-scrollbar">
                                            <div className="space-y-2">
                                                {visibleIssues.map(issue => (
                                                    <div key={issue.id} className="export-issue-card rounded-xl px-4 py-3">
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="min-w-0">
                                                                <div className="modal-title text-sm font-cn">
                                                                    {issue.rowLabel}
                                                                    {issue.category ? ` · ${issue.category}` : ''}
                                                                </div>
                                                                <div className="modal-subtle text-xs mt-1 leading-relaxed font-cn">{issue.summary}</div>
                                                            </div>
                                                            <span className={`status-badge px-2 py-1 text-[10px] rounded-full whitespace-nowrap ${
                                                                issue.status === 'failed' ? 'status-badge--failed' : 'status-badge--review'
                                                            }`}>
                                                                {issue.status === 'failed' ? '识别失败' : '建议检查'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </aside>
                            </>
                        )}
                    </main>
                </div>

                <div className="export-preview-footer p-4 border-t flex justify-end gap-3 z-10">
                    <button type="button" onClick={() => setShowExportPreview(false)} className="btn-ghost px-6 py-2.5 text-sm">取消</button>
                    {previewTab === 'excel' ? (
                        <button
                            onClick={() => window.exportToExcel(items, columns, reimbursementInfo)}
                            className="btn-primary px-8 py-2.5 rounded-lg font-bold flex items-center gap-2 text-sm"
                        >
                            <Download aria-hidden="true" size={18} />
                            <span>{exportReadiness?.hasIssues ? '导出 Excel' : '导出 Excel 文件'}</span>
                        </button>
                    ) : (
                        <button
                            onClick={() => window.exportToPrint(items, columns, reimbursementInfo)}
                            className="btn-primary px-8 py-2.5 rounded-lg font-bold flex items-center gap-2 text-sm"
                        >
                            <Download aria-hidden="true" size={18} />
                            <span>{exportReadiness?.hasIssues ? '打印 / 另存 PDF' : '去打印 / 另存为 PDF'}</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
