// ReimbursementTable component
// Depends on React, icons.js, and utilities being loaded before this script.

const reimbursementStatusMetaMap = {
    processing: { label: '正在识别', className: 'status-badge--processing' },
    needs_review: { label: '建议检查', className: 'status-badge--review' },
    ready: { label: '已完成', className: 'status-badge--ready' },
    failed: { label: '识别失败', className: 'status-badge--failed' }
};

const recognitionSourceLabels = {
    cache: '已从本地记录恢复',
    high_accuracy: '已使用增强识别',
    manual: '已手动修改'
};

const getRecognitionSourceLabel = item => {
    if (item.recognitionSource === 'cache' || item.isCached) return recognitionSourceLabels.cache;
    if (item.recognitionSource === 'high_accuracy') return recognitionSourceLabels.high_accuracy;
    if (item.recognitionSource === 'manual') return recognitionSourceLabels.manual;
    if (item.recognitionMeta?.['fall' + 'backUsed']) return '系统已自动再识别一次';
    return '';
};

const MoneyInput = React.memo(({ value, name, ariaLabel, onCommit }) => {
    const formattedValue = window.formatEditableMoney(value);
    const [rawValue, setRawValue] = React.useState(formattedValue);
    const isEditingRef = React.useRef(false);

    React.useEffect(() => {
        if (!isEditingRef.current) setRawValue(formattedValue);
    }, [formattedValue]);

    return (
        <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            className="input-modern money-input px-3 py-1.5 rounded text-sm w-full"
            value={isEditingRef.current ? rawValue : formattedValue}
            name={name}
            aria-label={ariaLabel}
            onFocus={() => {
                isEditingRef.current = true;
                setRawValue(String(value ?? ''));
            }}
            onChange={event => setRawValue(event.target.value)}
            onBlur={() => {
                isEditingRef.current = false;
                onCommit(rawValue);
                setRawValue(window.formatEditableMoney(rawValue));
            }}
            onKeyDown={event => {
                if (event.key === 'Enter') event.currentTarget.blur();
            }}
        />
    );
});

const areInvoiceRowPropsEqual = (previous, next) => (
    previous.item === next.item
    && previous.rowIndex === next.rowIndex
    && previous.expanded === next.expanded
    && previous.visibleColumns === next.visibleColumns
);

const MemoizedInvoiceRow = React.memo(
    ({ renderRow }) => renderRow(),
    areInvoiceRowPropsEqual
);

window.ReimbursementTable = ({
    items,
    columns,
    setColumns,
    toggleRow: toggleRowProp,
    expandedRows,
    updateItem: updateItemProp,
    deleteItem: deleteItemProp,
    handleImageUpload: handleImageUploadProp,
    handlePrimaryImageUpload: handlePrimaryImageUploadProp,
    setPdfPreviewUrl: setPdfPreviewUrlProp,
    addNewRow,
    setShowColumnManager,
    setShowExportPreview,
    initialColumns,
    isProcessing,
    reimbursementInfo,
    handleSaveProject,
    handleCleanProject,
    requestConfirm,
    notifyUser,
    setItems // Added prop
}) => {
    // Access global Icons and Utils
    const {
        Upload, X, ChevronDown, ChevronUp, Settings, Plus, Eye, RefreshCw, ArrowUpDown, Check
    } = window;

    // Sort State
    const [sortConfig, setSortConfig] = React.useState({ key: null, direction: 'asc' });
    const handlerRef = React.useRef({});
    handlerRef.current = {
        toggleRow: toggleRowProp,
        updateItem: updateItemProp,
        deleteItem: deleteItemProp,
        handleImageUpload: handleImageUploadProp,
        handlePrimaryImageUpload: handlePrimaryImageUploadProp,
        setPdfPreviewUrl: setPdfPreviewUrlProp
    };
    const stableRowActions = React.useMemo(() => ({
        toggleRow: (...args) => handlerRef.current.toggleRow(...args),
        updateItem: (...args) => handlerRef.current.updateItem(...args),
        deleteItem: (...args) => handlerRef.current.deleteItem(...args),
        handleImageUpload: (...args) => handlerRef.current.handleImageUpload(...args),
        handlePrimaryImageUpload: (...args) => handlerRef.current.handlePrimaryImageUpload(...args),
        setPdfPreviewUrl: (...args) => handlerRef.current.setPdfPreviewUrl(...args)
    }), []);
    const {
        toggleRow,
        updateItem,
        deleteItem,
        handleImageUpload,
        handlePrimaryImageUpload,
        setPdfPreviewUrl
    } = stableRowActions;

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

    const getStatusMeta = (item) => {
        if (item.status && reimbursementStatusMetaMap[item.status]) {
            return reimbursementStatusMetaMap[item.status];
        }
        return reimbursementStatusMetaMap.needs_review;
    };

    const visibleColumns = React.useMemo(() => columns.filter(column => column.visible), [columns]);

    const focusFirstEditor = itemId => {
        if (!expandedRows.has(itemId)) toggleRow(itemId);
        setTimeout(() => {
            document.querySelector(`[data-review-item="${itemId}"] input, [data-review-item="${itemId}"] textarea`)?.focus();
        }, 0);
    };

    const recognizeAgain = async (item, options) => {
        if (!item.file) return;
        await handlePrimaryImageUpload(item.id, item.file, {
            previewUrl: item.previewUrl || item.preview || null,
            ...options
        });
    };

    const retryItem = item => recognizeAgain(item, { mode: 'normal' });
    const enhanceItem = item => recognizeAgain(item, { mode: 'high_accuracy' });

    const confirmItem = itemId => {
        setItems(previousItems => previousItems.map(item => item.id === itemId
            ? { ...item, warningFlags: [], status: 'ready', lastError: '' }
            : item));
    };

    const handlePrimaryFileSelection = async (itemId, file) => {
        if (!file) return;

        if (file.type === 'application/pdf' || file.type.startsWith('image/')) {
            await handlePrimaryImageUpload(itemId, file);
        }
    };

    // formatCurrency, convertPDFToImage are global

    // Items Table
    if (items.length > 0) {
        return (
            <div className="invoice-table-shell rounded-xl overflow-hidden">
                <div className="invoice-table-wrapper overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar">
                    <table className="table-modern">
                        <thead>
                            <tr>
                                {visibleColumns.map(col => {
                                    const isSortable = ['amount', 'date', 'category'].includes(col.id);
                                    const ariaSort = sortConfig.key === col.id
                                        ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending')
                                        : 'none';
                                    return (
                                        <th
                                            key={col.id}
                                            className="invoice-table-header font-cn whitespace-nowrap sticky top-0 z-10 px-4 py-3"
                                            aria-sort={isSortable ? ariaSort : undefined}
                                        >
                                            {isSortable ? (
                                                <button
                                                    type="button"
                                                    className={`invoice-sort-button flex items-center gap-1 group rounded ${sortConfig.key === col.id ? 'is-active' : ''}`}
                                                    onClick={() => handleSort(col.id)}
                                                    aria-label={`按${col.label}排序`}
                                                >
                                                    {col.label}
                                                    <span className={`invoice-sort-icon transition-opacity ${sortConfig.key === col.id ? 'is-active opacity-100' : 'opacity-40 group-hover:opacity-70'}`}>
                                                        {sortConfig.key === col.id ? (
                                                            sortConfig.direction === 'asc' ? <ChevronDown aria-hidden="true" size={14} className="transform rotate-180" /> : <ChevronDown aria-hidden="true" size={14} />
                                                        ) : (
                                                            <ArrowUpDown aria-hidden="true" size={14} />
                                                        )}
                                                    </span>
                                                </button>
                                            ) : col.label}
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item, rowIndex) => (
                                <MemoizedInvoiceRow
                                    key={item.id}
                                    item={item}
                                    rowIndex={rowIndex}
                                    expanded={expandedRows.has(item.id)}
                                    visibleColumns={visibleColumns}
                                    renderRow={() => (
                                <React.Fragment>
                                    <tr
                                        className="invoice-table-row"
                                        style={{ contentVisibility: 'auto', containIntrinsicSize: '0 72px' }}
                                    >
                                        {visibleColumns.map(col => (
                                            <td key={col.id} className={col.width || ''}>
                                                {/* Render Content Based on Column ID */}
                                                {col.id === 'preview' && (
                                                    (() => {
                                                        const statusMeta = getStatusMeta(item);

                                                        return (
                                                            <div className="flex flex-col items-center gap-2">
                                                                {!item.previewUrl ? (
                                                                    <label
                                                                        className="invoice-image-slot w-12 h-12 rounded flex items-center justify-center cursor-pointer"
                                                                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                                                        onDrop={async (e) => {
                                                                            e.preventDefault();
                                                                            e.stopPropagation();
                                                                            await handlePrimaryFileSelection(item.id, e.dataTransfer.files[0]);
                                                                        }}
                                                                    >
                                                                        <Upload aria-hidden="true" size={16} />
                                                                        <input
                                                                            type="file"
                                                                            autoComplete="off"
                                                                            className="sr-only"
                                                                            accept="image/jpeg,image/png,application/pdf"
                                                                            name={`invoice-preview-${item.id}`}
                                                                            aria-label={`为第 ${rowIndex + 1} 行选择发票图片`}
                                                                            onChange={async (e) => handlePrimaryFileSelection(item.id, e.target.files[0])}
                                                                        />
                                                                    </label>
                                                                ) : (
                                                                    <div className="relative group w-12 h-12">
                                                                        <button
                                                                            type="button"
                                                                            className="w-12 h-12 rounded"
                                                                            onClick={() => setPdfPreviewUrl(item.previewUrl)}
                                                                            aria-label={`预览第 ${rowIndex + 1} 行发票`}
                                                                        >
                                                                            <img src={item.previewUrl} width={48} height={48}
                                                                                className="invoice-thumbnail w-12 h-12 object-cover rounded" alt="发票缩略图" />
                                                                        </button>
                                                                        <button type="button" onClick={(e) => {
                                                                            e.stopPropagation(); updateItem(item.id, 'previewUrl', null);
                                                                            updateItem(item.id, 'file', null);
                                                                        }}
                                                                            className="modal-close absolute -top-1 -right-1 rounded-full p-0.5 opacity-0
                          group-hover:opacity-100 focus:opacity-100 transition-opacity"
                                                                            aria-label={`删除第 ${rowIndex + 1} 行发票图片`}
                                                                        >
                                                                            <X aria-hidden="true" size={10} />
                                                                        </button>
                                                                    </div>
                                                                )}
                                                                <span className={`status-badge px-1.5 py-0.5 text-[10px] rounded-full whitespace-nowrap ${statusMeta.className}`}>
                                                                    {statusMeta.label}
                                                                </span>
                                                            </div>
                                                        );
                                                    })()
                                                )}

                                                {col.id === 'orderImage' && (
                                                    !item.orderImage ? (
                                                        <label
                                                            className="invoice-image-slot w-12 h-12 rounded flex items-center justify-center cursor-pointer"
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
                                                            <Upload aria-hidden="true" size={16} />
                                                            <input type="file" autoComplete="off" className="sr-only" accept="image/jpeg,image/png,application/pdf"
                                                                name={`invoice-order-${item.id}`} aria-label={`为第 ${rowIndex + 1} 行选择订单图`} onChange={async (e) => {
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
                                                            <button type="button" className="w-12 h-12 rounded"
                                                                onClick={() => setPdfPreviewUrl(item.orderImage)} aria-label={`预览第 ${rowIndex + 1} 行订单图`}>
                                                                <img src={item.orderImage} width={48} height={48}
                                                                    className="invoice-thumbnail w-12 h-12 object-cover rounded" alt="订单缩略图" />
                                                            </button>
                                                            <button type="button" onClick={(e) => { e.stopPropagation(); updateItem(item.id, 'orderImage', null); }}
                                                                className="modal-close absolute -top-1 -right-1 rounded-full p-0.5 opacity-0
                      group-hover:opacity-100 focus:opacity-100 transition-opacity"
                                                                aria-label={`删除第 ${rowIndex + 1} 行订单图`}
                                                            >
                                                                <X aria-hidden="true" size={10} />
                                                            </button>
                                                        </div>
                                                    )
                                                )}

                                                {col.id === 'paymentProof' && (
                                                    !item.paymentProof ? (
                                                        <label
                                                            className="invoice-image-slot w-12 h-12 rounded flex items-center justify-center cursor-pointer"
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
                                                            <Upload aria-hidden="true" size={16} />
                                                            <input type="file" autoComplete="off" className="sr-only" accept="image/jpeg,image/png,application/pdf"
                                                                name={`invoice-payment-${item.id}`} aria-label={`为第 ${rowIndex + 1} 行选择支付凭证`} onChange={async (e) => {
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
                                                            <button type="button" className="w-12 h-12 rounded"
                                                                onClick={() => setPdfPreviewUrl(item.paymentProof)} aria-label={`预览第 ${rowIndex + 1} 行支付凭证`}>
                                                                <img src={item.paymentProof} width={48} height={48}
                                                                    className="invoice-thumbnail w-12 h-12 object-cover rounded" alt="支付凭证缩略图" />
                                                            </button>
                                                            <button type="button" onClick={(e) => { e.stopPropagation(); updateItem(item.id, 'paymentProof', null); }}
                                                                className="modal-close absolute -top-1 -right-1 rounded-full p-0.5 opacity-0
                      group-hover:opacity-100 focus:opacity-100 transition-opacity"
                                                                aria-label={`删除第 ${rowIndex + 1} 行支付凭证`}
                                                            >
                                                                <X aria-hidden="true" size={10} />
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
                                                                notifyUser?.('最多只能上传 5 个附件。请先删除不需要的附件后再上传。', 'warning');
                                                                return;
                                                            }

                                                            let filesToProcess = Array.from(files);
                                                            if (filesToProcess.length > remaining) {
                                                                notifyUser?.(`最多只能上传 5 个附件，已自动保留前 ${remaining} 个文件。`, 'warning');
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
                                                                    className="invoice-image-slot w-12 h-12 rounded flex items-center justify-center cursor-pointer"
                                                                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                                                    onDrop={async (e) => {
                                                                        e.preventDefault(); e.stopPropagation();
                                                                        handleAppendBatch(e.dataTransfer.files);
                                                                    }}
                                                                >
                                                                    <Upload aria-hidden="true" size={16} />
                                                                    <input type="file" autoComplete="off" className="sr-only" multiple accept="image/jpeg,image/png,application/pdf"
                                                                        name={`invoice-attachments-${item.id}`} aria-label={`为第 ${rowIndex + 1} 行选择其他附件`}
                                                                        onChange={(e) => handleAppendBatch(e.target.files)} />
                                                                </label>
                                                            );
                                                        } else {
                                                            return (
                                                                <div className="flex items-center gap-4">
                                                                    <div className="relative group w-12 h-12 shrink-0">
                                                                        {/* Stack Effect */}
                                                                        {proofs.length > 1 && (
                                                                            <div className="invoice-thumbnail-stack absolute top-1 -right-1 w-12 h-12 rounded z-0 rotate-6 transform"></div>
                                                                        )}
                                                                        {/* Main Image */}
                                                                        <button type="button" onClick={() => setPdfPreviewUrl(proofs[0])}
                                                                            className="relative z-10 w-12 h-12 rounded"
                                                                            aria-label={`预览第 ${rowIndex + 1} 行其他附件`}>
                                                                            <img src={proofs[0]} width={48} height={48}
                                                                                className="invoice-thumbnail w-12 h-12 object-cover rounded"
                                                                                alt="附件缩略图" />
                                                                        </button>

                                                                        {/* Count Badge */}
                                                                        {proofs.length > 1 && (
                                                                            <div className="attachment-count-badge absolute -bottom-1 -right-1 z-20 text-[10px] font-bold px-1 rounded-sm shadow-sm">
                                                                                {proofs.length}
                                                                            </div>
                                                                        )}

                                                                        {/* Clear Button */}
                                                                        <button type="button" onClick={(e) => { e.stopPropagation(); updateItem(item.id, 'attachments', null); }}
                                                                            className="modal-close absolute -top-2 -left-2 rounded-full p-0.5 opacity-0
                                  group-hover:opacity-100 focus:opacity-100 transition-opacity z-30"
                                                                            aria-label={`清空第 ${rowIndex + 1} 行其他附件`}
                                                                        >
                                                                            <X aria-hidden="true" size={10} />
                                                                        </button>
                                                                    </div>

                                                                    {/* Add Button */}
                                                                    {proofs.length < 5 && (
                                                                        <label
                                                                            className="invoice-image-slot w-12 h-12 rounded flex items-center justify-center cursor-pointer transition"
                                                                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                                                            onDrop={async (e) => {
                                                                                e.preventDefault(); e.stopPropagation();
                                                                                handleAppendBatch(e.dataTransfer.files);
                                                                            }}
                                                                        >
                                                                            <Plus aria-hidden="true" size={16} />
                                                                            <input type="file" autoComplete="off" className="sr-only" multiple accept="image/jpeg,image/png,application/pdf"
                                                                                name={`invoice-attachments-more-${item.id}`} aria-label={`为第 ${rowIndex + 1} 行继续添加附件`}
                                                                                onChange={(e) => handleAppendBatch(e.target.files)} />
                                                                        </label>
                                                                    )}
                                                                </div>
                                                            );
                                                        }
                                                    })()
                                                )}

                                                {col.id === 'date' && (
                                                    <input type="date" autoComplete="off" className="input-modern px-3 py-1.5 rounded text-sm w-full" value={item.date}
                                                        name={`invoice-date-${item.id}`} aria-label={`第 ${rowIndex + 1} 行发票日期`}
                                                        onChange={e => updateItem(item.id, 'date', e.target.value)}
                                                    />
                                                )}

                                                {col.id === 'description' && (
                                                    <textarea
                                                        className="input-modern px-3 py-1.5 rounded text-sm w-full resize-y min-h-[34px] leading-tight"
                                                        value={item.description}
                                                        autoComplete="off"
                                                        name={`invoice-description-${item.id}`}
                                                        aria-label={`第 ${rowIndex + 1} 行摘要说明`}
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
                                                        <input type="text" autoComplete="off" className={`input-modern px-3 py-1.5 rounded text-sm w-full ${col.id === 'invoiceNumber' ? 'font-mono tabular-nums' : ''}`} value={item[col.id]}
                                                            name={`invoice-${col.id}-${item.id}`}
                                                            aria-label={`第 ${rowIndex + 1} 行${col.label}`}
                                                            onChange={e => updateItem(item.id, col.id, e.target.value)}
                                                        />
                                                    )}

                                                {['amount', 'subtotal', 'totalWithTax', 'tax'].includes(col.id) && (
                                                    <MoneyInput
                                                        value={item[col.id]}
                                                        name={`invoice-${col.id}-${item.id}`}
                                                        ariaLabel={`第 ${rowIndex + 1} 行${col.label}`}
                                                        onCommit={value => updateItem(item.id, col.id, value)}
                                                    />
                                                )}

                                                {['quantity', 'unitPrice'].includes(col.id) && (
                                                    <input type="number" step="0.01" inputMode="decimal" autoComplete="off"
                                                        className="input-modern money-input px-3 py-1.5 rounded text-sm w-full" value={item[col.id]}
                                                        name={`invoice-${col.id}-${item.id}`}
                                                        aria-label={`第 ${rowIndex + 1} 行${col.label}`}
                                                        onChange={e => updateItem(item.id, col.id, parseFloat(e.target.value) || 0)}
                                                    />
                                                )}

                                                {col.id === 'actions' && (
                                                    <div className="flex gap-2">
                                                        <button type="button" onClick={() => toggleRow(item.id)}
                                                            className="table-icon-action p-1.5 rounded"
                                                            aria-label={`${expandedRows.has(item.id) ? '收起' : '展开'}第 ${rowIndex + 1} 行详情`}
                                                            aria-expanded={expandedRows.has(item.id)}
                                                        >
                                                            {expandedRows.has(item.id) ?
                                                                <ChevronUp aria-hidden="true" size={16} /> :
                                                                <ChevronDown aria-hidden="true" size={16} />}
                                                        </button>
                                                        <button type="button" onClick={async () => {
                                                            const confirmed = requestConfirm
                                                                ? await requestConfirm({
                                                                    title: '删除这条发票记录？',
                                                                    description: '删除后无法恢复。请确认这条记录已经不需要保留。',
                                                                    confirmText: '确认删除',
                                                                    cancelText: '取消',
                                                                    variant: 'danger'
                                                                })
                                                                : true;
                                                            if (!confirmed) return;
                                                            deleteItem(item.id);
                                                        }}
                                                            className="table-icon-action table-icon-action--danger p-1.5 rounded"
                                                            aria-label={`删除第 ${rowIndex + 1} 行`}
                                                        >
                                                            <X aria-hidden="true" size={16} />
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        ))}
                                    </tr>
                                    {
                                        expandedRows.has(item.id) && (
                                            <tr>
                                                <td colSpan={visibleColumns.length} className="invoice-detail-row">
                                                    <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4" data-review-item={item.id}>
                                                        <div className="invoice-detail-panel md:col-span-3 pb-4 mb-2 font-cn">
                                                            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                                                                <div>
                                                                    <div className="flex items-center gap-2">
                                                                        <span className={`status-badge px-2 py-1 text-xs rounded-full ${getStatusMeta(item).className}`}>
                                                                            {getStatusMeta(item).label}
                                                                        </span>
                                                                        {getRecognitionSourceLabel(item) && (
                                                                            <span className="invoice-helper-text text-xs">{getRecognitionSourceLabel(item)}</span>
                                                                        )}
                                                                    </div>
                                                                    {Array.isArray(item.warningFlags) && item.warningFlags.length > 0 && (
                                                                        <ul className="invoice-warning-list mt-2 space-y-1 text-xs" aria-label={`第 ${rowIndex + 1} 行建议检查内容`}>
                                                                            {item.warningFlags.map(flag => (
                                                                                <li key={flag}>• {window.getWarningLabel ? window.getWarningLabel(flag) : '建议检查'}</li>
                                                                            ))}
                                                                        </ul>
                                                                    )}
                                                                    {!item.file && (item.status === 'failed' || item.status === 'needs_review') && (
                                                                        <p className="invoice-helper-text mt-2 text-xs">如需再次识别，需要重新选择文件；也可直接手动修改。</p>
                                                                    )}
                                                                </div>
                                                                <div className="flex flex-wrap gap-2">
                                                                    {item.status === 'failed' && (
                                                                        <>
                                                                            <button type="button" disabled={!item.file} title={!item.file ? '需要重新选择文件' : undefined}
                                                                                onClick={() => retryItem(item)} className="row-action row-action--primary px-3 py-1.5 rounded text-xs disabled:opacity-40">
                                                                                重新识别
                                                                            </button>
                                                                            <button type="button" disabled={!item.file} title={!item.file ? '需要重新选择文件' : undefined}
                                                                                onClick={() => enhanceItem(item)} className="row-action px-3 py-1.5 rounded text-xs disabled:opacity-40">
                                                                                增强识别
                                                                            </button>
                                                                            <button type="button" onClick={() => focusFirstEditor(item.id)} className="row-action px-3 py-1.5 rounded text-xs">
                                                                                手动填写
                                                                            </button>
                                                                        </>
                                                                    )}
                                                                    {item.status === 'needs_review' && (
                                                                        <>
                                                                            <button type="button" onClick={() => confirmItem(item.id)} className="row-action row-action--primary px-3 py-1.5 rounded text-xs">
                                                                                确认无误
                                                                            </button>
                                                                            <button type="button" disabled={!item.file} title={!item.file ? '需要重新选择文件' : undefined}
                                                                                onClick={() => enhanceItem(item)} className="row-action px-3 py-1.5 rounded text-xs disabled:opacity-40">
                                                                                增强识别
                                                                            </button>
                                                                            <button type="button" onClick={() => focusFirstEditor(item.id)} className="row-action px-3 py-1.5 rounded text-xs">
                                                                                手动修改
                                                                            </button>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        {['invoiceNumber', 'buyerName', 'sellerName', 'itemName', 'specification', 'unit', 'quantity',
                                                            'unitPrice', 'taxRate', 'tax', 'remarks'].map(field => {
                                                                const label = (initialColumns.find(c => c.id === field) || {}).label || field;
                                                                return (
                                                                    <div key={field}>
                                                                        <label className="table-label text-xs mb-1 block font-cn">{label}</label>
                                                                        {field === 'remarks' ? (
                                                                            <textarea className="input-modern px-3 py-2 rounded text-sm w-full resize-none" rows="2"
                                                                                autoComplete="off"
                                                                                name={`invoice-${field}-detail-${item.id}`} aria-label={`第 ${rowIndex + 1} 行${label}`}
                                                                                value={item[field]} onChange={e => updateItem(item.id, field, e.target.value)}
                                                                            />
                                                                        ) : field === 'tax' ? (
                                                                            <MoneyInput
                                                                                value={item[field]}
                                                                                name={`invoice-${field}-detail-${item.id}`}
                                                                                ariaLabel={`第 ${rowIndex + 1} 行${label}`}
                                                                                onCommit={value => updateItem(item.id, field, value)}
                                                                            />
                                                                        ) : (
                                                                            <input
                                                                                type={['quantity', 'unitPrice', 'tax', 'amount'].includes(field) ? "number" : "text"}
                                                                                autoComplete="off"
                                                                                inputMode={['quantity', 'unitPrice', 'tax', 'amount'].includes(field) ? 'decimal' : undefined}
                                                                                className={`input-modern px-3 py-1.5 rounded text-sm w-full ${['quantity', 'unitPrice', 'tax', 'amount'].includes(field) ? 'money-input' : ''} ${field === 'invoiceNumber' ? 'font-mono tabular-nums' : ''}`}
                                                                                name={`invoice-${field}-detail-${item.id}`}
                                                                                aria-label={`第 ${rowIndex + 1} 行${label}`}
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
                                    )}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Summary & Actions */}
                <div className="invoice-table-summary p-6">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                        <div className="text-sm">
                            <span className="invoice-total-label font-cn">总计：</span>
                            {/* Use proper calculation for display total */}
                            <span className="invoice-total-value text-2xl font-bold ml-2 font-en">¥{formatCurrency(items.reduce((sum, item) => sum + Number(item.amount || 0), 0))}</span>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowColumnManager(true)}
                                className="btn-secondary px-5 py-2.5 rounded-lg text-sm flex items-center gap-2 transition"
                            >
                                <Settings size={16} />
                                <span className="font-cn">列设置</span>
                            </button>
                            <button
                                onClick={addNewRow}
                                className="btn-secondary px-5 py-2.5 rounded-lg text-sm flex items-center gap-2 transition"
                            >
                                <Plus size={16} />
                                <span className="font-cn">添加新行</span>
                            </button>
                            {handleCleanProject && (
                                <button
                                    onClick={handleCleanProject}
                                    className="btn-secondary px-5 py-2.5 rounded-lg text-sm flex items-center gap-2 transition font-cn"
                                >
                                    <X size={16} />
                                    <span>清空</span>
                                </button>
                            )}
                            {handleSaveProject && (
                                <button
                                    onClick={handleSaveProject}
                                    className="btn-primary px-5 py-2.5 rounded-lg text-sm flex items-center gap-2 transition font-medium"
                                >
                                    <Check size={16} />
                                    <span className="font-cn">保存当前记录</span>
                                </button>
                            )}
                            <button
                                onClick={() => setShowExportPreview(true)}
                                className="btn-primary px-5 py-2.5 rounded-lg text-sm flex items-center gap-2 transition font-medium"
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
            <div className="table-empty-state text-center py-20">
                <Upload size={48} className="mx-auto mb-4 opacity-30" />
                <p className="font-cn mb-3">
                    暂无数据，请上传发票开始
                </p>
                <div className="flex items-center justify-center gap-2 text-sm">
                    <span>或</span>
                    <button
                        onClick={addNewRow}
                        className="btn-secondary px-4 py-2 rounded-lg transition font-cn"
                    >
                        添加默认空白行
                    </button>
                </div>
            </div>
        );
    }

    return null;
};
