window.ReimbursementInfo = ({
    reimbursementInfo,
    setReimbursementInfo
}) => {
    const { FileText } = window;

    return (
        <div className="lg:col-span-2 card-modern rounded-xl p-6 relative">
            <div className="flex items-center justify-between mb-4 pb-3 modal-divider border-b">
                <div className="flex items-center gap-2">
                    <FileText size={18} className="modal-subtle" />
                    <span className="modal-title font-semibold text-sm font-cn">报销单信息</span>
                    <span className="modal-subtle text-xs font-en">REIMBURSEMENT INFO</span>
                </div>

            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                    <label className="modal-subtle text-xs mb-1.5 block font-cn">报销人</label>
                    <input type="text" className="w-full px-3 py-2.5 input-modern rounded-lg text-sm" placeholder="例：黄鸟"
                        value={reimbursementInfo.reimburser} onChange={e => setReimbursementInfo({
                            ...reimbursementInfo,
                            reimburser: e.target.value
                        })}
                    />
                </div>
                <div>
                    <label className="modal-subtle text-xs mb-1.5 block font-cn">所属项目</label>
                    <input type="text" className="w-full px-3 py-2.5 input-modern rounded-lg text-sm" placeholder="例：11-12 月报销"
                        maxLength={30}
                        value={reimbursementInfo.project} onChange={e => setReimbursementInfo({
                            ...reimbursementInfo, project:
                                e.target.value
                        })}
                    />
                </div>
                <div>
                    <label className="modal-subtle text-xs mb-1.5 block font-cn">报销日期</label>
                    <input type="date" className="w-full px-3 py-2.5 input-modern rounded-lg text-sm"
                        value={reimbursementInfo.reimbursementDate} onChange={e => setReimbursementInfo({
                            ...reimbursementInfo,
                            reimbursementDate: e.target.value
                        })}
                    />
                </div>
            </div>
            <div className="mt-4">
                <label className="modal-subtle text-xs mb-1.5 block font-cn">收款信息</label>
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
