window.AppHeader = ({ autoSaveEnabled, setAutoSaveEnabled, saveStatus }) => {
    return (
        <header className="border-b border-[#2a2a2a] px-8 py-6">
            <div className="flex items-center justify-between">
                <img src="assets/Kairos Finance.svg" alt="Kairos Finance" width={180} height={40} className="h-10 w-auto opacity-90 hover:opacity-100 transition-opacity" />
                <div className="flex items-center gap-6">
                    <button
                        type="button"
                        role="switch"
                        aria-checked={autoSaveEnabled}
                        onClick={() => setAutoSaveEnabled(enabled => !enabled)}
                        className="flex items-center gap-2 group rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                    >
                        <span aria-hidden="true" className={`w-8 h-4 rounded-full p-0.5 transition-colors duration-300 ${autoSaveEnabled ? 'bg-yellow-400' : 'bg-gray-700'}`}>
                            <span className={`block w-3 h-3 bg-black rounded-full shadow-sm transform transition-transform duration-300 ${autoSaveEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                        </span>
                        <span className="text-[11px] text-gray-500 group-hover:text-gray-300 transition-colors font-cn">
                            {autoSaveEnabled ? '自动保存已开启' : '自动保存已关闭'}
                        </span>
                    </button>

                    <div className="flex items-center gap-2 pl-4 border-l border-gray-800" aria-live="polite" aria-atomic="true">
                        <span aria-hidden="true" className={`w-2 h-2 rounded-full transition-[background-color,box-shadow] duration-500 ${saveStatus === 'saving' ? 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.6)] motion-pulse' : 'bg-transparent border border-gray-600'}`} />
                        <span className={`text-[11px] font-cn ${saveStatus === 'saving' ? 'text-yellow-500' : 'text-gray-500'}`}>
                            {saveStatus === 'saving' ? '正在保存…' : '已保存'}
                        </span>
                    </div>
                </div>
            </div>
        </header>
    );
};
