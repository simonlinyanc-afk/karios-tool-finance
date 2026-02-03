const { useState, useEffect } = React;

window.VersionModal = ({ isOpen, onClose, versionData }) => {
    const { X, ExternalLink } = window;

    if (!isOpen || !versionData) return null;

    return (
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className="bg-[#141414] rounded-xl shadow-2xl w-full max-w-md border border-[#2a2a2a] overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="relative h-32 bg-gradient-to-br from-yellow-500/10 to-transparent flex items-center justify-center border-b border-[#2a2a2a]">
                    <div className="text-center pb-4">
                        <div className="inline-block px-3 py-1 rounded-full bg-yellow-500/20 border border-yellow-500/30 text-yellow-500 text-xs font-mono mb-3">
                            Whats New
                        </div>
                        <h2 className="text-2xl font-bold text-white font-cn mb-1">
                            版本更新
                        </h2>
                        <p className="text-gray-400 font-mono text-sm">v{versionData.version}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    <div className="space-y-4">
                        {versionData.updates.map((update, index) => (
                            <div key={index} className="flex gap-3 text-sm text-gray-300">
                                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-yellow-500 shrink-0"></span>
                                <span className="leading-relaxed">{update}</span>
                            </div>
                        ))}
                    </div>

                    {/* Footer */}
                    <div className="mt-8 pt-4 border-t border-[#2a2a2a] flex justify-center">
                        <a
                            href={versionData.historyLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-yellow-500 transition group"
                        >
                            <span>查看历史更新内容</span>
                            <ExternalLink size={12} className="group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-transform" />
                        </a>
                    </div>
                </div>

                <div className="p-4 bg-[#1a1a1a] border-t border-[#2a2a2a]">
                    <button
                        onClick={onClose}
                        className="w-full py-2.5 bg-yellow-500 hover:bg-yellow-400 text-black font-semibold rounded-lg transition active:scale-[0.98]"
                    >
                        我知道了
                    </button>
                </div>
            </div>
        </div>
    );
};
