window.ReimbursementInfo = ({
    reimbursementInfo,
    setReimbursementInfo,
    handleSaveProject,
    handleCleanProject,
    setShowHistory
}) => {
    const { Settings, Clock } = window;

    return (
        <div className="lg:col-span-2 card-modern rounded-xl p-6">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#2a2a2a]">
                <div className="flex items-center gap-2">
                    <Settings size={18} className="text-yellow-400" />
                    <span className="font-semibold text-sm font-cn">报销单信息</span>
                    <span className="text-xs text-gray-500 font-en">REIMBURSEMENT INFO</span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleSaveProject}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-400 hover:bg-yellow-500 text-black text-xs font-bold rounded transition-colors font-cn shadow-sm"
                    >
                        SAVE PROJECT
                    </button>
                    <button
                        onClick={handleCleanProject}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-600 text-gray-400 hover:text-white hover:border-white text-xs font-bold rounded transition-colors font-en"
                    >
                        CLEAN
                    </button>
                    <button
                        onClick={() => setShowHistory(true)}
                        className="ml-2 text-gray-500 hover:text-yellow-400 transition-colors flex items-center gap-1.5 text-xs font-cn"
                    >
                        <Clock size={14} />
                        <span>版本记录</span>
                    </button>
                </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                    <label className="text-xs text-gray-500 mb-1.5 block font-cn">报销人</label>
                    <input type="text" className="w-full px-3 py-2.5 input-modern rounded-lg text-sm" placeholder="例：黄鸟"
                        value={reimbursementInfo.reimburser} onChange={e => setReimbursementInfo({
                            ...reimbursementInfo,
                            reimburser: e.target.value
                        })}
                    />
                </div>
                <div>
                    <label className="text-xs text-gray-500 mb-1.5 block font-cn">所属项目</label>
                    <input type="text" className="w-full px-3 py-2.5 input-modern rounded-lg text-sm" placeholder="例：11-12 月报销"
                        maxLength={30}
                        value={reimbursementInfo.project} onChange={e => setReimbursementInfo({
                            ...reimbursementInfo, project:
                                e.target.value
                        })}
                    />
                </div>
                <div>
                    <label className="text-xs text-gray-500 mb-1.5 block font-cn">报销日期</label>
                    <input type="date" className="w-full px-3 py-2.5 input-modern rounded-lg text-sm"
                        value={reimbursementInfo.reimbursementDate} onChange={e => setReimbursementInfo({
                            ...reimbursementInfo,
                            reimbursementDate: e.target.value
                        })}
                    />
                </div>
            </div>
            <div className="mt-4">
                <label className="text-xs text-gray-500 mb-1.5 block font-cn">收款信息</label>
                <input type="text" className="w-full px-3 py-2.5 input-modern rounded-lg text-sm" placeholder="请输入银行卡号或收款账户信息"
                    value={reimbursementInfo.paymentInfo} onChange={e => setReimbursementInfo({
                        ...reimbursementInfo,
                        paymentInfo: e.target.value
                    })}
                />
            </div>
        </div>
    );
};
