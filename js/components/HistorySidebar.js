window.HistorySidebar = ({ isOpen, onClose, onRestore, onExport, requestConfirm }) => {
    const { X, RefreshCw, Briefcase, Trash2, Download, Edit2, Check, X: XIcon } = window;
    const [history, setHistory] = React.useState([]);
    const [loading, setLoading] = React.useState(false);

    // Rename State
    const [editingId, setEditingId] = React.useState(null);
    const [editName, setEditName] = React.useState('');

    // Load history when sidebar opens
    React.useEffect(() => {
        if (isOpen) {
            loadHistory();
        }
    }, [isOpen]);

    const loadHistory = async () => {
        if (window.storageRepo && window.storageRepo.getHistoryRecords) {
            setLoading(true);
            const records = await window.storageRepo.getHistoryRecords();
            setHistory(records);
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        const confirmed = requestConfirm
            ? await requestConfirm({
                title: '删除这条历史记录？',
                description: '删除后无法恢复。建议确认这条记录已经不再需要。',
                confirmText: '确认删除',
                cancelText: '取消',
                variant: 'danger'
            })
            : true;
        if (!confirmed) return;
        if (window.storageRepo && window.storageRepo.deleteHistoryItem) {
            await window.storageRepo.deleteHistoryItem(id);
            loadHistory(); // Reload list
        }
    };

    const handleRestore = async (record) => {
        const confirmed = requestConfirm
            ? await requestConfirm({
                title: '恢复这条历史记录？',
                description: '恢复后会覆盖当前未保存的编辑。请先确认当前内容已经不需要保留。',
                confirmText: '继续恢复',
                cancelText: '取消',
                variant: 'warning'
            })
            : true;
        if (!confirmed) return;
        onRestore(record);
        onClose();
    };

    const startEditing = (record, currentTitle) => {
        setEditingId(record.id);
        setEditName(currentTitle);
    };

    const saveEdit = async (id) => {
        if (window.storageRepo && window.storageRepo.updateHistoryTitle) {
            await window.storageRepo.updateHistoryTitle(id, editName);
            setEditingId(null);
            loadHistory();
        }
    };

    return (
        <>
            {/* Backdrop with Blur - Clicking outside closes sidebar */}
            {isOpen && (
                <div
                    className="history-overlay fixed inset-0 backdrop-blur-md z-[70] transition-opacity duration-300"
                    onClick={onClose}
                ></div>
            )}

            {/* Sidebar Styling */}
            <div className={`history-sidebar fixed inset-y-0 right-0 w-96 transform transition-transform duration-300 ease-in-out z-[80] ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="h-full flex flex-col">
                    {/* Header */}
                    <div className="history-sidebar__header p-6 border-b flex justify-between items-center">
                        <div>
                            <h2 className="modal-title text-lg font-bold font-cn">历史记录</h2>
                            <p className="modal-subtle text-xs font-cn mt-0.5">最近保存的报销记录</p>
                        </div>
                        <button onClick={onClose} className="modal-close transition-colors p-2 rounded-full" aria-label="关闭历史记录">
                            <X size={20} />
                        </button>
                    </div>

                    {/* List */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                        {loading ? (
                            <div className="flex justify-center py-8">
                                <RefreshCw className="animate-spin modal-subtle" size={24} />
                            </div>
                        ) : history.length === 0 ? (
                            <div className="table-empty-state text-center py-10">
                                <Briefcase size={40} className="mx-auto mb-3 opacity-20" />
                                <p className="text-sm font-cn">暂无历史记录</p>
                            </div>
                        ) : (
                            history.map((record) => {
                                // Data Normalization for older saved records
                                const isV1_1 = !!record.snapshot;
                                const displayTitle = record.title || record.project || '无标题项目';
                                const items = isV1_1 ? record.snapshot.items : record.items;
                                const info = isV1_1 ? record.snapshot.info : (record.info || {
                                    project: record.project,
                                    reimburser: record.reimburser,
                                    reimbursementDate: record.date
                                });
                                const columns = isV1_1 ? record.snapshot.columns : [];

                                return (
                                    <div key={record.id} className="history-card group relative rounded-lg p-5 text-left">
                                        <div className="flex justify-between items-center mb-5 min-h-[44px]">
                                            {editingId === record.id ? (
                                                <div className="flex items-center gap-2 flex-1 w-full">
                                                    <input
                                                        type="text"
                                                        className="input-modern flex-1 rounded px-2 py-1 text-sm"
                                                        value={editName}
                                                        onChange={(e) => setEditName(e.target.value)}
                                                        autoFocus
                                                    />
                                                    <button onClick={() => saveEdit(record.id)} className="table-icon-action p-1 rounded" aria-label="保存版本名称"><Check size={16} /></button>
                                                    <button onClick={() => setEditingId(null)} className="table-icon-action p-1 rounded" aria-label="取消编辑版本名称"><XIcon size={16} /></button>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="flex flex-col flex-1 pr-2 min-w-0">
                                                        <div className="flex items-start gap-2">
                                                            <span className="modal-title text-sm font-bold font-cn whitespace-normal break-all leading-tight" title={displayTitle}>
                                                                {displayTitle}
                                                            </span>
                                                            <button
                                                                onClick={() => startEditing(record, displayTitle)}
                                                                className="table-icon-action opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 flex-shrink-0 p-1 rounded"
                                                                aria-label="编辑版本名称"
                                                            >
                                                                <Edit2 size={12} />
                                                            </button>
                                                        </div>
                                                        <span className="modal-subtle text-[10px] font-en font-mono mt-1">
                                                            {new Date(record.timestamp).toLocaleString()}
                                                        </span>
                                                    </div>
                                                </>
                                            )}
                                        </div>

                                        <div className="history-card__summary p-5 rounded">
                                            <div className="history-total text-xl font-bold font-mono tracking-tight flex items-baseline">
                                                <span className="text-xs mr-0.5">¥</span>{formatCurrency(record.total)}
                                            </div>
                                            <div className="modal-subtle text-xs font-cn mt-1 flex items-center gap-2">
                                                <span className="history-count-badge px-1.5 py-0.5 rounded font-mono">{record.count}</span> 张发票
                                            </div>
                                        </div>

                                        <div className="overflow-hidden max-h-0 opacity-0 group-hover:max-h-14 group-hover:opacity-100 group-hover:mt-5 transition-[max-height,opacity,margin] duration-300 ease-out">
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => {
                                                        if (onExport) {
                                                            onExport(record);
                                                            // Close sidebar? Probably better to keep open or closed?
                                                            // Usually if modal opens, sidebar should close or stay under?
                                                            // Let's close it for better UX
                                                            onClose();
                                                        }
                                                    }}
                                                    className="history-action flex-1 flex items-center justify-center gap-1.5 py-2 rounded text-xs font-medium"
                                                    title="导出"
                                                >
                                                    <Download size={14} />
                                                    <span className="font-cn">导出</span>
                                                </button>
                                                <button
                                                    onClick={() => handleRestore({ ...record, items, info })}
                                                    className="history-action flex-1 flex items-center justify-center gap-1.5 py-2 rounded text-xs font-medium"
                                                >
                                                    <RefreshCw size={14} />
                                                    <span>恢复</span>
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(record.id)}
                                                    className="history-action history-action--danger w-9 flex items-center justify-center rounded"
                                                    aria-label="删除历史记录"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Footer */}
                    <div className="history-sidebar__footer p-4 border-t flex flex-col gap-3">
                        <button
                            onClick={async () => {
                                const confirmed = requestConfirm
                                    ? await requestConfirm({
                                        title: '清空所有历史记录？',
                                        description: '清空后无法恢复。建议确认近期记录已经不再需要。',
                                        confirmText: '确认清空',
                                        cancelText: '取消',
                                        variant: 'danger'
                                    })
                                    : true;
                                if (!confirmed) return;
                                if (window.storageRepo && window.storageRepo.clearAllHistory) {
                                    await window.storageRepo.clearAllHistory();
                                    loadHistory();
                                }
                            }}
                            className="history-clear-button w-full py-2.5 rounded text-xs font-cn"
                        >
                            清空历史记录
                        </button>
                        <div className="modal-subtle text-center text-[10px] font-cn">
                            自动保留最近 30 天记录
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};
