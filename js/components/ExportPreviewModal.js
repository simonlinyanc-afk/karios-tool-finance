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
    const { Settings, Eye, FileText, Briefcase, X, Download, ChevronRight, AlertCircle } = window;
    const { PDFTemplate } = window;
    const [showCheckDetails, setShowCheckDetails] = React.useState(false);
    const closeExportPreview = React.useCallback(() => setShowExportPreview(false), [setShowExportPreview]);
    const dialogRef = window.useModalAccessibility(showExportPreview, closeExportPreview);
    const exportReadiness = window.getExportReadiness ? window.getExportReadiness(items) : null;
    const warningLabels = [
        { key: 'missing_date', label: '缺少日期' },
        { key: 'missing_amount', label: '缺少金额' },
        { key: 'missing_description', label: '缺少摘要说明' },
        { key: 'ocr_failed', label: '识别失败' }
    ];
    const visibleIssues = exportReadiness?.issues.slice(0, 12) || [];

    if (!showExportPreview) return null;

    return (
        <div
            className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 animate-fade-in"
            onClick={() => setShowExportPreview(false)}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="export-preview-title"
                tabIndex={-1}
                className="bg-[#1a1a1a] rounded-xl w-full max-w-7xl h-[90vh] flex border border-[#2a2a2a] shadow-2xl overflow-hidden overscroll-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400"
                onClick={e => e.stopPropagation()}
            >
                {/* Left Sidebar - Column Settings */}
                <div className="w-64 bg-[#141414] border-r border-[#2a2a2a] flex flex-col">
                    <div className="p-4 border-b border-[#2a2a2a]">
                        <h3 className="font-bold font-cn text-lg flex items-center gap-2 text-white">
                            <Settings aria-hidden="true" size={18} className="text-yellow-500" />
                            导出列设置
                        </h3>
                        <p className="text-xs text-gray-500 mt-1">勾选以包含在导出文件中</p>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                        {columns.map(col => (
                            <label key={col.id} className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition border border-transparent hover:bg-[#252525] ${col.visible ? 'text-gray-200' : 'text-gray-500'}`}>
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
                                    className={`w-4 h-4 rounded border-gray-600 bg-[#333] focus:ring-yellow-500 focus:ring-offset-[#1a1a1a] ${col.fixed ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                />
                                <span className="text-sm font-medium flex-1">{col.label}</span>
                                {col.fixed && <span className="text-[10px] text-yellow-500/70 bg-yellow-500/10 px-1.5 py-0.5 rounded">必选</span>}
                            </label>
                        ))}
                    </div>
                </div>

                {/* Right Content - Preview */}
                <div className="flex-1 flex flex-col bg-[#1a1a1a]">
                    {/* Header */}
                    <div className="flex justify-between items-center p-4 border-b border-[#2a2a2a] bg-[#1a1a1a]">
                        <div className="flex items-center gap-6">
                            <h3 id="export-preview-title" className="font-bold font-cn text-lg flex items-center gap-2">
                                <Eye aria-hidden="true" size={18} className="text-yellow-500" />
                                导出预览
                            </h3>
                            <div className="flex bg-[#0f0f0f] rounded-lg p-1 border border-[#2a2a2a]">
                                <button
                                    onClick={() => setPreviewTab('excel')}
                                    className={`px-4 py-1.5 text-xs rounded-md transition font-medium flex items-center gap-2 ${previewTab === 'excel' ? 'bg-[#2a2a2a] text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                                >
                                    <FileText aria-hidden="true" size={14} /> Excel 预览
                                </button>
                                <button
                                    onClick={() => setPreviewTab('pdf')}
                                    className={`px-4 py-1.5 text-xs rounded-md transition font-medium flex items-center gap-2 ${previewTab === 'pdf' ? 'bg-[#2a2a2a] text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                                >
                                    <Briefcase aria-hidden="true" size={14} /> PDF 打印预览
                                </button>
                            </div>
                        </div>
                        <button type="button" onClick={() => setShowExportPreview(false)} aria-label="关闭导出预览"
                            className="text-gray-400 hover:text-white bg-[#2a2a2a] hover:bg-[#333] p-2 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400">
                            <X aria-hidden="true" size={18} />
                        </button>
                    </div>

                    {exportReadiness && (
                        <div className="border-b border-[#2a2a2a] bg-[#121212] px-6 py-4">
                            <div className="rounded-2xl border border-[#2a2a2a] bg-[#101010] px-4 py-4">
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 text-sm font-semibold text-white font-cn">
                                            <AlertCircle aria-hidden="true" size={16} className={exportReadiness.hasIssues ? 'text-yellow-400' : 'text-emerald-300'} />
                                            导出前检查
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1 font-cn">
                                            {exportReadiness.hasIssues
                                                ? `还有 ${exportReadiness.needsReviewCount} 条发票建议检查，${exportReadiness.failedCount} 条未完成识别。`
                                                : '当前条目已完成，导出前建议再快速检查金额和发票号码。'}
                                        </p>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                                        <span className="px-3 py-1 rounded-full border border-emerald-400/20 bg-emerald-500/10 text-emerald-300 text-xs font-cn">
                                            已完成 {exportReadiness.readyCount}
                                        </span>
                                        <span className="px-3 py-1 rounded-full border border-yellow-400/20 bg-yellow-500/10 text-yellow-200 text-xs font-cn">
                                            建议检查 {exportReadiness.needsReviewCount}
                                        </span>
                                        <span className="px-3 py-1 rounded-full border border-red-400/20 bg-red-500/10 text-red-300 text-xs font-cn">
                                            识别失败 {exportReadiness.failedCount}
                                        </span>
                                        {exportReadiness.hasIssues && (
                                            <>
                                                {exportReadiness.needsReviewCount > 0 && (
                                                    <button type="button" onClick={() => setShowCheckDetails(true)}
                                                        className="inline-flex items-center gap-2 rounded-full border border-[#343434] bg-[#181818] px-3 py-1.5 text-xs text-white transition-colors hover:border-yellow-400/40 hover:text-yellow-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400">
                                                        先去检查
                                                    </button>
                                                )}
                                                {exportReadiness.failedCount > 0 && (
                                                    <button type="button" onClick={() => setShowCheckDetails(true)}
                                                        className="inline-flex items-center gap-2 rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-200 transition-colors hover:border-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400">
                                                        查看失败项
                                                    </button>
                                                )}
                                                <button type="button" onClick={() => setShowCheckDetails(current => !current)}
                                                    className="inline-flex items-center gap-2 rounded-full border border-[#343434] bg-[#181818] px-3 py-1.5 text-xs text-white transition-colors hover:border-yellow-400/40 hover:text-yellow-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400"
                                                    aria-expanded={showCheckDetails}>
                                                    <span>{showCheckDetails ? '收起检查清单' : '展开检查清单'}</span>
                                                    <ChevronRight aria-hidden="true" size={14} className={`transition-transform ${showCheckDetails ? 'rotate-180' : ''}`} />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>

                                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                                    {warningLabels.map(item => (
                                        <div key={item.key} className="rounded-lg border border-[#242424] bg-[#0c0c0c] px-3 py-2">
                                            <div className="text-[10px] text-gray-500 tracking-[0.18em] uppercase">{item.label}</div>
                                            <div className="text-lg text-white font-semibold mt-1">
                                                {exportReadiness.warningCounts[item.key] || 0}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Preview Area */}
                    <div className="relative flex-1 overflow-hidden bg-[#0a0a0a]">
                        <div className="h-full overflow-auto p-8 flex justify-center">
                            {previewTab === 'excel' ? (
                                <div className="bg-white text-black p-10 shadow-xl min-h-full w-full max-w-5xl overflow-x-auto">
                                    <div className="flex justify-between items-end mb-8 border-b-2 border-gray-800 pb-4">
                                        <h1 className="text-3xl font-bold text-gray-800">报销单 (Excel 预览)</h1>
                                        <div className="text-right text-xs text-gray-500">
                                            <p className="mb-1"><span className="font-bold">报销人:</span> {reimbursementInfo.reimburser || '-'}</p>
                                            <p className="mb-1"><span className="font-bold">项目:</span> {reimbursementInfo.project || '-'}</p>
                                            <p className="mb-1"><span className="font-bold">日期:</span> {reimbursementInfo.reimbursementDate || '-'}</p>
                                            <p><span className="font-bold">打款信息:</span> {reimbursementInfo.paymentInfo || '-'}</p>
                                        </div>
                                    </div>
                                    <table className="w-full border-collapse border border-gray-300 text-xs table-fixed">
                                        <thead>
                                            <tr className="bg-gray-100">
                                                {columns.filter(c => c.visible && c.id !== 'actions').map(col => (
                                                    <th key={col.id} className="border border-gray-300 p-2 text-left font-bold text-gray-700 bg-gray-50">{col.label}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {items.map((item, idx) => (
                                                <tr key={item.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                                    {columns.filter(c => c.visible && c.id !== 'actions').map(col => (
                                                        <td key={col.id} className="border border-gray-300 p-2 text-left text-gray-600 truncate max-w-[150px]" title={typeof item[col.id] === 'string' ? item[col.id] : ''}>
                                                            {['preview', 'orderImage', 'paymentProof', 'attachments'].includes(col.id) ? (
                                                                (() => {
                                                                    if (col.id === 'attachments') {
                                                                        const val = item[col.id];
                                                                        const images = Array.isArray(val) ? val : (val && typeof val === 'string' ? [val] : []);
                                                                        return images.length > 0 ? (
                                                                            <div className="flex gap-1 flex-wrap">
                                                                                {images.map((url, i) => (
                                                                                    <img key={i} src={url} width={40} height={40} alt={`附件 ${i + 1}`} className="h-10 w-10 object-cover rounded border border-gray-200" />
                                                                                ))}
                                                                            </div>
                                                                        ) : <span className="text-gray-300">-</span>;
                                                                    }

                                                                    let url = null;
                                                                    if (col.id === 'preview') url = item.previewUrl || item.preview;
                                                                    else if (col.id === 'orderImage') url = item.orderImageUrl || item.orderImage;
                                                                    else if (col.id === 'paymentProof') url = item.paymentProofUrl || item.paymentProof;

                                                                    return url ? (
                                                                        <img src={url} width={40} height={40} alt={col.label} className="h-10 w-10 object-cover rounded border border-gray-200" />
                                                                    ) : <span className="text-gray-300">-</span>;
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
                                            <tr className="bg-yellow-50 font-bold">
                                                <td colSpan={columns.filter(c => c.visible && c.id !== 'actions').length - 1} className="border border-gray-300 p-2 text-right">总计:</td>
                                                <td className="border border-gray-300 p-2 text-left">¥{formatCurrency(items.reduce((sum, item) => sum + Number(item.amount || 0), 0))}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            ) : (
                                <div className="transform scale-90 origin-top shadow-2xl">
                                    <PDFTemplate items={items} reimbursementInfo={reimbursementInfo} columns={columns} />
                                </div>
                            )}
                        </div>

                        {exportReadiness?.hasIssues && (
                            <>
                                {showCheckDetails && (
                                    <button
                                        type="button"
                                        className="absolute inset-0 bg-black/30"
                                        onClick={() => setShowCheckDetails(false)}
                                        aria-label="关闭检查清单"
                                    />
                                )}
                                <aside
                                    className={`absolute top-0 right-0 h-full w-full max-w-[360px] border-l border-[#2a2a2a] bg-[#111111] shadow-2xl transition-transform duration-300 ${
                                        showCheckDetails ? 'translate-x-0' : 'translate-x-full'
                                    }`}
                                    aria-label="导出前检查清单"
                                    aria-hidden={!showCheckDetails}
                                >
                                    <div className="flex h-full flex-col">
                                        <div className="flex items-start justify-between gap-4 border-b border-[#242424] px-5 py-4">
                                            <div>
                                                <div className="text-sm font-semibold text-white font-cn">检查清单</div>
                                                <p className="text-xs text-gray-500 mt-1 font-cn">仅列出需要你补充或确认的条目，不再占用预览空间。</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setShowCheckDetails(false)}
                                                className="rounded-full bg-[#1b1b1b] p-2 text-gray-400 transition-colors hover:bg-[#242424] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400"
                                                aria-label="关闭检查清单"
                                            >
                                                <X aria-hidden="true" size={16} />
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3 border-b border-[#242424] px-5 py-4">
                                            {warningLabels.map(item => (
                                                <div key={item.key} className="rounded-xl border border-[#242424] bg-[#0b0b0b] px-3 py-2">
                                                    <div className="text-[10px] text-gray-500 tracking-[0.18em] uppercase">{item.label}</div>
                                                    <div className="mt-1 text-lg font-semibold text-white">
                                                        {exportReadiness.warningCounts[item.key] || 0}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="flex-1 overflow-y-auto px-4 py-4 custom-scrollbar">
                                            <div className="space-y-2">
                                                {visibleIssues.map(issue => (
                                                    <div key={issue.id} className="rounded-xl border border-[#242424] bg-[#0b0b0b] px-4 py-3">
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="min-w-0">
                                                                <div className="text-sm text-white font-cn">
                                                                    {issue.rowLabel}
                                                                    {issue.category ? ` · ${issue.category}` : ''}
                                                                </div>
                                                                <div className="text-xs text-gray-500 mt-1 leading-relaxed font-cn">{issue.summary}</div>
                                                            </div>
                                                            <span className={`px-2 py-1 text-[10px] rounded-full whitespace-nowrap ${
                                                                issue.status === 'failed'
                                                                    ? 'bg-red-500/10 text-red-300 border border-red-400/20'
                                                                    : 'bg-yellow-500/10 text-yellow-200 border border-yellow-400/20'
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
                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-[#2a2a2a] bg-[#1a1a1a] flex justify-end gap-3 z-10">
                        <button type="button" onClick={() => setShowExportPreview(false)} className="px-6 py-2.5 text-gray-400 hover:text-white transition-colors text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400">取消</button>
                        {previewTab === 'excel' ? (
                            <button
                                onClick={() => window.exportToExcel(items, columns, reimbursementInfo)}
                                className="btn-primary px-8 py-2.5 rounded-lg font-bold flex items-center gap-2 text-sm shadow-lg shadow-yellow-500/20"
                            >
                                <Download aria-hidden="true" size={18} />
                                <span>{exportReadiness?.hasIssues ? '仍然导出 Excel' : '导出 Excel 文件'}</span>
                            </button>
                        ) : (
                            <button
                                onClick={() => window.exportToPrint(items, columns, reimbursementInfo)}
                                className="btn-primary px-8 py-2.5 rounded-lg font-bold flex items-center gap-2 text-sm shadow-lg shadow-yellow-500/20"
                            >
                                <Download aria-hidden="true" size={18} />
                                <span>{exportReadiness?.hasIssues ? '仍然打印 / 另存 PDF' : '去打印 / 另存为 PDF'}</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
