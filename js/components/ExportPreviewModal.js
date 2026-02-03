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
    const { Settings, Eye, FileText, Briefcase, X, Download } = window;
    const { PDFTemplate } = window;

    if (!showExportPreview) return null;

    return (
        <div
            className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 animate-fade-in"
            onClick={() => setShowExportPreview(false)}
        >
            <div
                className="bg-[#1a1a1a] rounded-xl w-full max-w-7xl h-[90vh] flex border border-[#2a2a2a] shadow-2xl overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Left Sidebar - Column Settings */}
                <div className="w-64 bg-[#141414] border-r border-[#2a2a2a] flex flex-col">
                    <div className="p-4 border-b border-[#2a2a2a]">
                        <h3 className="font-bold font-cn text-lg flex items-center gap-2 text-white">
                            <Settings size={18} className="text-yellow-500" />
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
                            <h3 className="font-bold font-cn text-lg flex items-center gap-2">
                                <Eye size={18} className="text-yellow-500" />
                                导出预览
                            </h3>
                            <div className="flex bg-[#0f0f0f] rounded-lg p-1 border border-[#2a2a2a]">
                                <button
                                    onClick={() => setPreviewTab('excel')}
                                    className={`px-4 py-1.5 text-xs rounded-md transition font-medium flex items-center gap-2 ${previewTab === 'excel' ? 'bg-[#2a2a2a] text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                                >
                                    <FileText size={14} /> Excel 预览
                                </button>
                                <button
                                    onClick={() => setPreviewTab('pdf')}
                                    className={`px-4 py-1.5 text-xs rounded-md transition font-medium flex items-center gap-2 ${previewTab === 'pdf' ? 'bg-[#2a2a2a] text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                                >
                                    <Briefcase size={14} /> PDF 打印预览
                                </button>
                            </div>
                        </div>
                        <button onClick={() => setShowExportPreview(false)} className="text-gray-400 hover:text-white bg-[#2a2a2a] hover:bg-[#333] p-2 rounded-full transition">
                            <X size={18} />
                        </button>
                    </div>

                    {/* Preview Area */}
                    <div className="flex-1 overflow-auto bg-[#0a0a0a] p-8 relative flex justify-center">
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
                                                                                <img key={i} src={url} alt="att" className="h-10 w-10 object-cover rounded border border-gray-200" />
                                                                            ))}
                                                                        </div>
                                                                    ) : <span className="text-gray-300">-</span>;
                                                                }

                                                                let url = null;
                                                                if (col.id === 'preview') url = item.previewUrl || item.preview;
                                                                else if (col.id === 'orderImage') url = item.orderImageUrl || item.orderImage;
                                                                else if (col.id === 'paymentProof') url = item.paymentProofUrl || item.paymentProof;

                                                                return url ? (
                                                                    <img src={url} alt={col.label} className="h-10 w-10 object-cover rounded border border-gray-200" />
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

                    {/* Footer */}
                    <div className="p-4 border-t border-[#2a2a2a] bg-[#1a1a1a] flex justify-end gap-3 z-10">
                        <button onClick={() => setShowExportPreview(false)} className="px-6 py-2.5 text-gray-400 hover:text-white transition text-sm">取消</button>
                        {previewTab === 'excel' ? (
                            <button
                                onClick={() => window.exportToExcel(items, columns, reimbursementInfo)}
                                className="btn-primary px-8 py-2.5 rounded-lg font-bold flex items-center gap-2 text-sm shadow-lg shadow-yellow-500/20"
                            >
                                <Download size={18} />
                                <span>导出 Excel 文件</span>
                            </button>
                        ) : (
                            <button
                                onClick={() => window.exportToPrint(items, columns, reimbursementInfo)}
                                className="btn-primary px-8 py-2.5 rounded-lg font-bold flex items-center gap-2 text-sm shadow-lg shadow-yellow-500/20"
                            >
                                <Download size={18} />
                                <span>去打印 / 另存为 PDF</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
