window.PDFTemplate = ({ items, reimbursementInfo, columns }) => {
    // Start of component JSX
    // Use 'amount' for total calculation to match visible column
    const pdfTotalAmount = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    // Filter columns based on visibility toggle (respect the 'visible' property)
    const visibleColumns = columns.filter(c => c.visible && c.id !== 'actions');

    // Use 275mm width to ensure it fits within A4 Landscape (297mm) minus margins
    return (
        <div id="pdf-preview-content" className="p-4 bg-white text-black w-[275mm] min-h-[210mm] mx-auto text-[9px] relative">
            <div className="flex items-center justify-between mb-3">
                <img src="assets/logo_text.png" alt="Kairos Studio Logo" className="h-8" />
                <h1 className="text-lg font-bold flex-1 text-center">报销单</h1>
                <img src="assets/logo_graph.png" alt="Kairos Graph Logo" className="h-8" />
            </div>

            <div className="mb-2 grid grid-cols-3 gap-2 text-[10px]">
                <p><strong>报销人:</strong> {reimbursementInfo.reimburser || '未填写'}</p>
                <p><strong>所属项目:</strong> {reimbursementInfo.project || '未填写'}</p>
                <p><strong>报销日期:</strong> {reimbursementInfo.reimbursementDate || new Date().toLocaleDateString('zh-CN')}</p>
            </div>
            <div className="mb-2 text-[10px]">
                <p><strong>收款信息:</strong> {reimbursementInfo.paymentInfo || '未填写'}</p>
            </div>

            <table className="w-full border-collapse mb-2 table-auto">
                <thead>
                    <tr>
                        {visibleColumns.map(col => (
                            <th key={col.id} className="border border-gray-400 p-1 text-left bg-gray-100">{col.label}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {items.map(item => (
                        <tr key={item.id}>
                            {visibleColumns.map(col => (
                                <td key={col.id} className="border border-gray-400 p-1">
                                    {(() => {
                                        if (['preview', 'orderImage', 'paymentProof'].includes(col.id)) {
                                            let url = null;
                                            if (col.id === 'preview') url = item.previewUrl || item.preview;
                                            else if (col.id === 'orderImage') url = item.orderImageUrl || item.orderImage;
                                            else if (col.id === 'paymentProof') url = item.paymentProofUrl || item.paymentProof;
                                            else url = item[col.id];

                                            return url ? (
                                                <img src={url} className="w-16 h-16 object-contain mx-auto" alt={col.label} />
                                            ) : null;
                                        }

                                        // Non-image columns
                                        if (['amount', 'subtotal', 'totalWithTax', 'tax', 'unitPrice'].includes(col.id)) {
                                            return `¥${formatCurrency(item[col.id])}`;
                                        }
                                        return item[col.id] || '';
                                    })()}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr>
                        <td colSpan={visibleColumns.length - 1} className="border border-gray-400 p-1 text-right font-bold bg-gray-50">
                            总计:</td>
                        <td className="border border-gray-400 p-1 text-right font-bold bg-gray-50">¥{formatCurrency(pdfTotalAmount)}</td>
                    </tr>
                </tfoot>
            </table>

            <div className="text-xs mt-6">
                <p><strong>备注:</strong></p>
                <p className="min-h-[30px] border-b border-gray-300"></p>
            </div>

            <div className="flex justify-between mt-8 text-xs">
                <p><strong>报销人签字:</strong> <span className="min-w-[100px] inline-block border-b border-gray-300"></span></p>
                <p><strong>审核人签字:</strong> <span className="min-w-[100px] inline-block border-b border-gray-300"></span></p>
            </div>
        </div>
    );
};
