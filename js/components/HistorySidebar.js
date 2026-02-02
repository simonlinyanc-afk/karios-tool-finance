window.HistorySidebar = ({ isOpen, onClose, onRestore, onExport }) => {
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
        if (confirm('确定要删除这条记录吗？')) {
            if (window.storageRepo && window.storageRepo.deleteHistoryItem) {
                await window.storageRepo.deleteHistoryItem(id);
                loadHistory(); // Reload list
            }
        }
    };

    const handleRestore = (record) => {
        if (confirm('恢复历史记录将覆盖当前未保存的编辑，确定要继续吗？')) {
            onRestore(record);
            onClose();
        }
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
                    className="fixed inset-0 bg-black/60 backdrop-blur-md z-40 transition-opacity duration-300"
                    onClick={onClose}
                ></div>
            )}

            {/* Sidebar Styling: Dark Mode, Wider (w-96) */}
            <div className={`fixed inset-y-0 right-0 w-96 bg-[#1a1a1a] shadow-2xl transform transition-transform duration-300 ease-in-out z-50 border-l border-[#333] ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="h-full flex flex-col">
                    {/* Header */}
                    <div className="p-6 border-b border-[#2a2a2a] flex justify-between items-center bg-[#1a1a1a]">
                        <div>
                            <h2 className="text-lg font-bold font-cn text-white">版本记录</h2>
                            <p className="text-xs text-gray-500 font-en tracking-wider mt-0.5">VERSION RECORDS</p>
                        </div>
                        <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-2 rounded-full hover:bg-[#333]">
                            <X size={20} />
                        </button>
                    </div>

                    {/* List */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                        {loading ? (
                            <div className="flex justify-center py-8">
                                <RefreshCw className="animate-spin text-yellow-500" size={24} />
                            </div>
                        ) : history.length === 0 ? (
                            <div className="text-center py-10 text-gray-600">
                                <Briefcase size={40} className="mx-auto mb-3 opacity-20" />
                                <p className="text-sm font-cn">暂无历史记录</p>
                            </div>
                        ) : (
                            history.map((record) => {
                                // Data Normalization (Handle v1.0 vs v1.1.0)
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
                                    <div key={record.id} className="group relative bg-[#252525] border border-[#333] rounded-lg p-5 hover:border-yellow-500 hover:shadow-lg hover:shadow-yellow-500/10 transition-all text-left">
                                        <div className="flex justify-between items-center mb-5 min-h-[44px]">
                                            {editingId === record.id ? (
                                                <div className="flex items-center gap-2 flex-1 w-full">
                                                    <input
                                                        type="text"
                                                        className="flex-1 bg-[#1a1a1a] border border-yellow-500/50 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-yellow-500"
                                                        value={editName}
                                                        onChange={(e) => setEditName(e.target.value)}
                                                        autoFocus
                                                    />
                                                    <button onClick={() => saveEdit(record.id)} className="text-green-500 hover:text-green-400 p-1"><Check size={16} /></button>
                                                    <button onClick={() => setEditingId(null)} className="text-gray-500 hover:text-gray-400 p-1"><XIcon size={16} /></button>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="flex flex-col flex-1 pr-2 min-w-0">
                                                        <div className="flex items-start gap-2">
                                                            <span className="text-sm font-bold text-gray-200 font-cn whitespace-normal break-all leading-tight" title={displayTitle}>
                                                                {displayTitle}
                                                            </span>
                                                            <button
                                                                onClick={() => startEditing(record, displayTitle)}
                                                                className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-yellow-500 transition-opacity mt-0.5 flex-shrink-0"
                                                            >
                                                                <Edit2 size={12} />
                                                            </button>
                                                        </div>
                                                        <span className="text-[10px] text-gray-500 font-en font-mono mt-1">
                                                            {new Date(record.timestamp).toLocaleString()}
                                                        </span>
                                                    </div>
                                                </>
                                            )}
                                        </div>

                                        <div className="bg-[#1f1f1f] p-5 rounded border border-[#2a2a2a]">
                                            <div className="text-xl font-bold text-yellow-500 font-mono tracking-tight flex items-baseline">
                                                <span className="text-xs mr-0.5">¥</span>{formatCurrency(record.total)}
                                            </div>
                                            <div className="text-xs text-gray-500 font-cn mt-1 flex items-center gap-2">
                                                <span className="bg-[#333] text-gray-300 px-1.5 py-0.5 rounded font-mono border border-[#444]">{record.count}</span> 张发票
                                            </div>
                                        </div>

                                        <div className="overflow-hidden max-h-0 opacity-0 group-hover:max-h-14 group-hover:opacity-100 group-hover:mt-5 transition-all duration-300 ease-out">
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
                                                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[#333] text-gray-300 rounded hover:bg-[#444] hover:text-white border border-[#444] text-xs font-medium transition-colors"
                                                    title="导出"
                                                >
                                                    <Download size={14} />
                                                    <span className="font-cn">导出</span>
                                                </button>
                                                <button
                                                    onClick={() => handleRestore({ ...record, items, info })}
                                                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[#333] text-gray-300 rounded hover:bg-yellow-500 hover:text-black border border-[#444] hover:border-yellow-500 text-xs font-medium transition-colors"
                                                >
                                                    <RefreshCw size={14} />
                                                    <span>恢复</span>
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(record.id)}
                                                    className="w-9 flex items-center justify-center bg-[#333] text-gray-500 rounded hover:bg-red-500/20 hover:text-red-500 border border-[#444] hover:border-red-500/50 transition-colors"
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
                    <div className="p-4 border-t border-[#2a2a2a] bg-[#1a1a1a] flex flex-col gap-3">
                        <button
                            onClick={async () => {
                                if (confirm('确定要清空所有历史记录吗？此操作无法撤销。')) {
                                    if (window.storageRepo && window.storageRepo.clearAllHistory) {
                                        await window.storageRepo.clearAllHistory();
                                        loadHistory();
                                    }
                                }
                            }}
                            className="w-full py-2.5 border border-[#333] text-gray-500 rounded text-xs font-mono hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/30 transition-colors"
                        >
                            [ CLEAR ALL ]
                        </button>
                        <div className="text-center text-[10px] text-gray-600 font-en">
                            AUTO-CLEANUP: 30 DAYS
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};
