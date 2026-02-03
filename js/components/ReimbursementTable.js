// ReimbursementTable component
// Depends on React, icons.js, and utils.js being loaded BEFORE this script

window.ReimbursementTable = ({
    items,
    columns,
    setColumns,
    toggleRow,
    expandedRows,
    updateItem,
    deleteItem,
    handleImageUpload,
    setOcrConfirmation,
    setPdfPreviewUrl,
    addNewRow,
    setShowColumnManager,
    setShowExportPreview,
    initialColumns,
    isProcessing,
    reimbursementInfo,
    setItems // Added prop
}) => {
    // Access global Icons and Utils
    const {
        Upload, X, ChevronDown, ChevronUp, Settings, Plus, Eye, RefreshCw, ArrowUpDown
    } = window;

    // Sort State
    const [sortConfig, setSortConfig] = React.useState({ key: null, direction: 'asc' });

    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key) {
            if (sortConfig.direction === 'asc') direction = 'desc';
            else if (sortConfig.direction === 'desc') direction = null;
        }

        setSortConfig({ key: direction ? key : null, direction });

        if (!direction) {
            // Reset: Sort by ID (Creation Time)
            const sortedItems = [...items].sort((a, b) => a.id - b.id);
            setItems(sortedItems);
            return;
        }

        const sortedItems = [...items].sort((a, b) => {
            let valA = a[key];
            let valB = b[key];

            // Handle Numbers
            if (key === 'amount' || key === 'totalWithTax') { // 'amount' is 'Amount (After Tax)' displayed? 
                // Actually ID 'amount' is usually "Amount (Tax Included)" or "Amount" depending on col def.
                // User asked for "Money (After Tax)". In our cols:
                // { id: 'amount', label: '金额（税后）' }
                valA = parseFloat(valA) || 0;
                valB = parseFloat(valB) || 0;
            }

            // Handle Dates
            if (key === 'date') {
                valA = new Date(valA || '1970-01-01');
                valB = new Date(valB || '1970-01-01');
            }

            // Handle Strings (Category)
            if (key === 'category') {
                valA = (valA || '').toString().localeCompare(valB || '', 'zh-CN');
                return direction === 'asc' ? valA : -valA; // helper for string
            }

            if (valA < valB) return direction === 'asc' ? -1 : 1;
            if (valA > valB) return direction === 'asc' ? 1 : -1;
            return 0;
        });

        setItems(sortedItems);
    };
    // formatCurrency, convertPDFToImage are global

    // Items Table
    if (items.length > 0) {
        return (
            <div className="card-modern rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar">
                    <table className="table-modern">
                        <thead>
                            <tr>
                                {columns.filter(c => c.visible).map(col => {
                                    const isSortable = ['amount', 'date', 'category'].includes(col.id);
                                    return (
                                        <th key={col.id} className="font-cn whitespace-nowrap sticky top-0 bg-[#141414] z-50 px-4 py-3">
                                            <div className={`flex items-center gap-1 ${isSortable ? 'cursor-pointer hover:text-white group' : ''}`}
                                                onClick={() => isSortable && handleSort(col.id)}>
                                                {col.label}
                                                {isSortable && (
                                                    <span className={`transition-opacity ${sortConfig.key === col.id ? 'opacity-100 text-yellow-400' : 'opacity-30 group-hover:opacity-70'}`}>
                                                        {sortConfig.key === col.id ? (
                                                            sortConfig.direction === 'asc' ? <ChevronDown size={14} className="transform rotate-180" /> : <ChevronDown size={14} />
                                                        ) : (
                                                            <ArrowUpDown size={14} />
                                                        )}
                                                    </span>
                                                )}
                                            </div>
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody>
                            {items.map(item => (
                                <React.Fragment key={item.id}>
                                    <tr>
                                        {columns.filter(c => c.visible).map(col => (
                                            <td key={col.id} className={col.width || ''}>
                                                {/* Render Content Based on Column ID */}
                                                {col.id === 'preview' && (
                                                    !item.previewUrl ? (
                                                        <label
                                                            className="w-12 h-12 bg-[#1a1a1a] rounded flex items-center justify-center cursor-pointer hover:bg-[#2a2a2a] border border-dashed border-gray-700"
                                                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                                            onDrop={async (e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                let file = e.dataTransfer.files[0];
                                                                if (file) {
                                                                    if (file.type === 'application/pdf') {
                                                                        file = await convertPDFToImage(file);
                                                                    }
                                                                    if (file && file.type.startsWith('image/')) {
                                                                        const url = URL.createObjectURL(file);
                                                                        setOcrConfirmation({ show: true, itemId: item.id, file: file, imageUrl: url });
                                                                    }
                                                                }
                                                            }}
                                                        >
                                                            <Upload size={16} className="text-gray-500" />
                                                            <input type="file" className="hidden" accept="image/*,application/pdf" onChange={async (e) => {
                                                                let file = e.target.files[0];
                                                                if (file) {
                                                                    if (file.type === 'application/pdf') {
                                                                        file = await convertPDFToImage(file);
                                                                    }
                                                                    if (file && file.type.startsWith('image/')) {
                                                                        const url = URL.createObjectURL(file);
                                                                        setOcrConfirmation({ show: true, itemId: item.id, file: file, imageUrl: url });
                                                                    }
                                                                }
                                                            }} />
                                                        </label>
                                                    ) : (
                                                        <div className="relative group w-12 h-12">
                                                            <img src={item.previewUrl}
                                                                className="w-12 h-12 object-cover rounded cursor-pointer border border-gray-700" onClick={() =>
                                                                    setPdfPreviewUrl(item.previewUrl)} alt="invoice" />
                                                            <button onClick={(e) => {
                                                                e.stopPropagation(); updateItem(item.id, 'previewUrl', null);
                                                                updateItem(item.id, 'file', null);
                                                            }}
                                                                className="absolute -top-1 -right-1 bg-black/80 text-white rounded-full p-0.5 opacity-0
                      group-hover:opacity-100 transition"
                                                            >
                                                                <X size={10} />
                                                            </button>
                                                        </div>
                                                    )
                                                )}

                                                {col.id === 'orderImage' && (
                                                    !item.orderImage ? (
                                                        <label
                                                            className="w-12 h-12 bg-[#1a1a1a] rounded flex items-center justify-center cursor-pointer hover:bg-[#2a2a2a] border border-dashed border-gray-700"
                                                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                                            onDrop={async (e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                let file = e.dataTransfer.files[0];
                                                                if (file) {
                                                                    if (file.type === 'application/pdf') {
                                                                        file = await convertPDFToImage(file);
                                                                    }
                                                                    // Check for image/ after potential conversion
                                                                    if (file && file.type.startsWith('image/')) {
                                                                        handleImageUpload(item.id, 'orderImage', file);
                                                                    }
                                                                }
                                                            }}
                                                        >
                                                            <Upload size={16} className="text-gray-500" />
                                                            <input type="file" className="hidden" accept="image/*,application/pdf" onChange={async (e) => {
                                                                let file = e.target.files[0];
                                                                if (file) {
                                                                    if (file.type === 'application/pdf') {
                                                                        file = await convertPDFToImage(file);
                                                                    }
                                                                    if (file && file.type.startsWith('image/')) {
                                                                        handleImageUpload(item.id, 'orderImage', file);
                                                                    }
                                                                }
                                                            }} />
                                                        </label>
                                                    ) : (
                                                        <div className="relative group w-12 h-12">
                                                            <img src={item.orderImage}
                                                                className="w-12 h-12 object-cover rounded cursor-pointer border border-gray-700" onClick={() =>
                                                                    setPdfPreviewUrl(item.orderImage)} alt="order" />
                                                            <button onClick={(e) => { e.stopPropagation(); updateItem(item.id, 'orderImage', null); }}
                                                                className="absolute -top-1 -right-1 bg-black/80 text-white rounded-full p-0.5 opacity-0
                      group-hover:opacity-100 transition"
                                                            >
                                                                <X size={10} />
                                                            </button>
                                                        </div>
                                                    )
                                                )}

                                                {col.id === 'paymentProof' && (
                                                    !item.paymentProof ? (
                                                        <label
                                                            className="w-12 h-12 bg-[#1a1a1a] rounded flex items-center justify-center cursor-pointer hover:bg-[#2a2a2a] border border-dashed border-gray-700"
                                                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                                            onDrop={async (e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                let file = e.dataTransfer.files[0];
                                                                if (file) {
                                                                    if (file.type === 'application/pdf') {
                                                                        file = await convertPDFToImage(file);
                                                                    }
                                                                    if (file && file.type.startsWith('image/')) {
                                                                        handleImageUpload(item.id, 'paymentProof', file);
                                                                    }
                                                                }
                                                            }}
                                                        >
                                                            <Upload size={16} className="text-gray-500" />
                                                            <input type="file" className="hidden" accept="image/*,application/pdf" onChange={async (e) => {
                                                                let file = e.target.files[0];
                                                                if (file) {
                                                                    if (file.type === 'application/pdf') {
                                                                        file = await convertPDFToImage(file);
                                                                    }
                                                                    if (file && file.type.startsWith('image/')) {
                                                                        handleImageUpload(item.id, 'paymentProof', file);
                                                                    }
                                                                }
                                                            }} />
                                                        </label>
                                                    ) : (
                                                        <div className="relative group w-12 h-12">
                                                            <img src={item.paymentProof}
                                                                className="w-12 h-12 object-cover rounded cursor-pointer border border-gray-700" onClick={() =>
                                                                    setPdfPreviewUrl(item.paymentProof)} alt="payment" />
                                                            <button onClick={(e) => { e.stopPropagation(); updateItem(item.id, 'paymentProof', null); }}
                                                                className="absolute -top-1 -right-1 bg-black/80 text-white rounded-full p-0.5 opacity-0
                      group-hover:opacity-100 transition"
                                                            >
                                                                <X size={10} />
                                                            </button>
                                                        </div>
                                                    )
                                                )}

                                                {col.id === 'attachments' && (
                                                    (() => {
                                                        const proofs = Array.isArray(item.attachments)
                                                            ? item.attachments
                                                            : (item.attachments ? [item.attachments] : []);

                                                        const handleAppendBatch = async (files) => {
                                                            if (!files || files.length === 0) return;

                                                            const currentCount = proofs.length;
                                                            const remaining = 5 - currentCount;

                                                            if (remaining <= 0) {
                                                                alert('最多只能上传 5 个附件');
                                                                return;
                                                            }

                                                            let filesToProcess = Array.from(files);
                                                            if (filesToProcess.length > remaining) {
                                                                alert(`最多只能上传 5 个附件，已自动截取前 ${remaining} 个文件`);
                                                                filesToProcess = filesToProcess.slice(0, remaining);
                                                            }

                                                            const newUrls = [];
                                                            for (let i = 0; i < filesToProcess.length; i++) {
                                                                let file = filesToProcess[i];
                                                                if (file.type === 'application/pdf' && window.convertPDFToImage) {
                                                                    file = await window.convertPDFToImage(file);
                                                                }
                                                                if (file && file.type.startsWith('image/')) {
                                                                    newUrls.push(URL.createObjectURL(file));
                                                                }
                                                            }
                                                            if (newUrls.length > 0) {
                                                                updateItem(item.id, 'attachments', [...proofs, ...newUrls]);
                                                            }
                                                        };

                                                        if (proofs.length === 0) {
                                                            return (
                                                                <label
                                                                    className="w-12 h-12 bg-[#1a1a1a] rounded flex items-center justify-center cursor-pointer hover:bg-[#2a2a2a] border border-dashed border-gray-700"
                                                                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                                                    onDrop={async (e) => {
                                                                        e.preventDefault(); e.stopPropagation();
                                                                        handleAppendBatch(e.dataTransfer.files);
                                                                    }}
                                                                >
                                                                    <Upload size={16} className="text-gray-500" />
                                                                    <input type="file" className="hidden" multiple accept="image/*,application/pdf" onChange={(e) => handleAppendBatch(e.target.files)} />
                                                                </label>
                                                            );
                                                        } else {
                                                            return (
                                                                <div className="flex items-center gap-4">
                                                                    <div className="relative group w-12 h-12 shrink-0 cursor-pointer" onClick={() => setPdfPreviewUrl(proofs[0])}>
                                                                        {/* Stack Effect */}
                                                                        {proofs.length > 1 && (
                                                                            <div className="absolute top-1 -right-1 w-12 h-12 bg-[#333] rounded border border-gray-600 z-0 rotate-6 transform"></div>
                                                                        )}
                                                                        {/* Main Image */}
                                                                        <img src={proofs[0]}
                                                                            className="relative z-10 w-12 h-12 object-cover rounded border border-gray-700 bg-[#1a1a1a]"
                                                                            alt="attachment" />

                                                                        {/* Count Badge */}
                                                                        {proofs.length > 1 && (
                                                                            <div className="absolute -bottom-1 -right-1 z-20 bg-yellow-500 text-black text-[10px] font-bold px-1 rounded-sm shadow-sm">
                                                                                {proofs.length}
                                                                            </div>
                                                                        )}

                                                                        {/* Clear Button */}
                                                                        <button onClick={(e) => { e.stopPropagation(); updateItem(item.id, 'attachments', null); }}
                                                                            className="absolute -top-2 -left-2 bg-black/80 text-white rounded-full p-0.5 opacity-0
                                  group-hover:opacity-100 transition z-30"
                                                                        >
                                                                            <X size={10} />
                                                                        </button>
                                                                    </div>

                                                                    {/* Add Button */}
                                                                    {proofs.length < 5 && (
                                                                        <label
                                                                            className="w-12 h-12 bg-[#1a1a1a] rounded flex items-center justify-center cursor-pointer hover:bg-[#2a2a2a] border border-dashed border-gray-700 transition"
                                                                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                                                            onDrop={async (e) => {
                                                                                e.preventDefault(); e.stopPropagation();
                                                                                handleAppendBatch(e.dataTransfer.files);
                                                                            }}
                                                                        >
                                                                            <Plus size={16} className="text-gray-500" />
                                                                            <input type="file" className="hidden" multiple accept="image/*,application/pdf" onChange={(e) => handleAppendBatch(e.target.files)} />
                                                                        </label>
                                                                    )}
                                                                </div>
                                                            );
                                                        }
                                                    })()
                                                )}

                                                {col.id === 'date' && (
                                                    <input type="date" className="input-modern px-3 py-1.5 rounded text-sm w-full" value={item.date}
                                                        onChange={e => updateItem(item.id, 'date', e.target.value)}
                                                    />
                                                )}

                                                {col.id === 'description' && (
                                                    <textarea
                                                        className="input-modern px-3 py-1.5 rounded text-sm w-full resize-y min-h-[34px] leading-tight"
                                                        value={item.description}
                                                        rows={1}
                                                        onChange={e => updateItem(item.id, 'description', e.target.value)}
                                                        style={{ fieldSizing: 'content' }} // Modern browser support for auto-grow
                                                        onInput={(e) => {
                                                            e.target.style.height = 'auto';
                                                            e.target.style.height = e.target.scrollHeight + 'px';
                                                        }}
                                                    />
                                                )}

                                                {['category', 'itemName', 'specification', 'unit', 'taxRate', 'invoiceNumber',
                                                    'buyerName', 'sellerName', 'remarks'].includes(col.id) && (
                                                        <input type="text" className="input-modern px-3 py-1.5 rounded text-sm w-full" value={item[col.id]}
                                                            onChange={e => updateItem(item.id, col.id, e.target.value)}
                                                        />
                                                    )}

                                                {['amount', 'quantity', 'unitPrice', 'subtotal', 'totalWithTax', 'tax'].includes(col.id) && (
                                                    <input type="number" step="0.01"
                                                        className="input-modern px-3 py-1.5 rounded text-sm w-full text-right" value={item[col.id]}
                                                        // Financial fields: Pass raw string to let calculateTax handle parsing/formatting
                                                        onChange={e => updateItem(item.id, col.id,
                                                            ['amount', 'subtotal', 'tax', 'totalWithTax'].includes(col.id)
                                                                ? e.target.value
                                                                : (parseFloat(e.target.value) || 0)
                                                        )}
                                                    />
                                                )}

                                                {col.id === 'actions' && (
                                                    <div className="flex gap-2">
                                                        <button onClick={() => toggleRow(item.id)}
                                                            className="p-1.5 hover:bg-[#2a2a2a] rounded"
                                                            title="展开详情"
                                                        >
                                                            {expandedRows.has(item.id) ?
                                                                <ChevronUp size={16} /> :
                                                                <ChevronDown size={16} />}
                                                        </button>
                                                        <button onClick={() => deleteItem(item.id)}
                                                            className="p-1.5 hover:bg-red-500/10 text-red-400 rounded"
                                                            title="删除"
                                                        >
                                                            <X size={16} />
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        ))}
                                    </tr>
                                    {
                                        expandedRows.has(item.id) && (
                                            <tr>
                                                <td colSpan={columns.filter(c => c.visible).length} className="bg-[#0f0f0f]">
                                                    <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                                                        <div className="md:col-span-3 pb-2 border-b border-[#2a2a2a] mb-2 font-cn text-xs text-gray-400">
                                                            详细信息
                                                        </div>
                                                        {['invoiceNumber', 'buyerName', 'sellerName', 'itemName', 'specification', 'unit', 'quantity',
                                                            'unitPrice', 'taxRate', 'tax', 'remarks'].map(field => {
                                                                const label = (initialColumns.find(c => c.id === field) || {}).label || field;
                                                                return (
                                                                    <div key={field}>
                                                                        <label className="text-xs text-gray-500 mb-1 block font-cn">{label}</label>
                                                                        {field === 'remarks' ? (
                                                                            <textarea className="input-modern px-3 py-2 rounded text-sm w-full resize-none" rows="2"
                                                                                value={item[field]} onChange={e => updateItem(item.id, field, e.target.value)}
                                                                            />
                                                                        ) : (
                                                                            <input
                                                                                type={['quantity', 'unitPrice', 'tax', 'amount'].includes(field) ? "number" : "text"}
                                                                                className="input-modern px-3 py-1.5 rounded text-sm w-full"
                                                                                value={item[field]}
                                                                                onChange={e => updateItem(item.id, field,
                                                                                    ['amount', 'tax', 'subtotal'].includes(field)
                                                                                        ? e.target.value
                                                                                        : (['quantity', 'unitPrice'].includes(field) ? parseFloat(e.target.value) || 0 : e.target.value)
                                                                                )}
                                                                            />
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    }
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Summary & Actions */}
                <div className="p-6 border-t border-[#2a2a2a] bg-[#0f0f0f]">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                        <div className="text-sm">
                            <span className="text-gray-500 font-cn">总计：</span>
                            {/* Use proper calculation for display total */}
                            <span className="text-2xl font-bold text-yellow-400 ml-2 font-en">¥{formatCurrency(items.reduce((sum, item) => sum + Number(item.amount || 0), 0))}</span>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowColumnManager(true)}
                                className="px-5 py-2.5 bg-[#1a1a1a] hover:bg-[#2a2a2a] border border-[#2a2a2a] rounded-lg text-sm flex items-center gap-2 transition"
                            >
                                <Settings size={16} />
                                <span className="font-cn">列设置</span>
                            </button>
                            <button
                                onClick={addNewRow}
                                className="px-5 py-2.5 bg-[#1a1a1a] hover:bg-[#2a2a2a] border border-[#2a2a2a] rounded-lg text-sm flex items-center gap-2 transition"
                            >
                                <Plus size={16} />
                                <span className="font-cn">添加新行</span>
                            </button>
                            <button
                                onClick={() => setShowExportPreview(true)}
                                className="px-5 py-2.5 bg-[#F5D158] hover:bg-[#e5c148] text-black border border-[#F5D158] rounded-lg text-sm flex items-center gap-2 transition font-medium"
                            >
                                <Eye size={16} />
                                <span className="font-cn">导出预览</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Empty State
    if (items.length === 0 && !isProcessing) {
        return (
            <div className="text-center py-20 text-gray-600">
                <Upload size={48} className="mx-auto mb-4 opacity-30" />
                <p className="font-cn mb-3 text-gray-600">
                    暂无数据，请上传发票开始
                </p>
                <div className="flex items-center justify-center gap-2 text-sm">
                    <span>或</span>
                    <button
                        onClick={() => {
                            setItems([{
                                id: Date.now(),
                                date: new Date().toISOString().split('T')[0],
                                category: '',
                                description: '',
                                itemName: '',
                                specification: '',
                                quantity: 1,
                                unit: '',
                                unitPrice: 0,
                                amount: 0,
                                invoiceNumber: '',
                                buyerName: '',
                                sellerName: '',
                                remarks: '',
                                previewUrl: null,
                                orderImage: null,
                                paymentProof: null,
                                taxRate: '',
                                tax: 0,
                                subtotal: 0,
                                totalWithTax: 0,
                                isPDF: false,
                                file: null
                            }]);
                        }}
                        className="px-4 py-2 bg-[#2a2a2a] hover:bg-[#3a3a3a] text-gray-300 rounded-lg transition font-cn"
                    >
                        添加默认空白行
                    </button>
                </div>
            </div>
        );
    }

    return null;
};
