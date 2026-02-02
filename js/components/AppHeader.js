window.AppHeader = ({ autoSaveEnabled, setAutoSaveEnabled, saveStatus }) => {
    return (
        <header className="border-b border-[#2a2a2a] px-8 py-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <img src="assets/logo.png" alt="Logo" className="h-10 opacity-80 hover:opacity-100 transition-opacity" />
                </div>
                <div className="flex items-center gap-6">
                    {/* Auto-save Switch */}
                    <div
                        className="flex items-center gap-2 cursor-pointer group"
                        onClick={() => setAutoSaveEnabled(!autoSaveEnabled)}
                        title="Toggle Auto-save"
                    >
                        <div className={`w-8 h-4 rounded-full p-0.5 transition-colors duration-300 ${autoSaveEnabled ? 'bg-yellow-400' : 'bg-gray-700'}`}>
                            <div className={`w-3 h-3 bg-black rounded-full shadow-sm transform transition-transform duration-300 ${autoSaveEnabled ? 'translate-x-4' : 'translate-x-0'}`}></div>
                        </div>
                        <span className="text-[10px] text-gray-500 font-en tracking-wider group-hover:text-gray-300 transition-colors">AUTO SAVE</span>
                    </div>

                    {/* Breathing Status */}
                    <div className="flex items-center gap-2 pl-4 border-l border-gray-800">
                        <div className={`w-2 h-2 rounded-full transition-all duration-500 ${saveStatus === 'saving' ? 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.6)] animate-pulse' : 'bg-transparent border border-gray-600'}`}></div>
                        <span className={`text-[10px] font-en tracking-widest ${saveStatus === 'saving' ? 'text-yellow-500' : 'text-gray-600'}`}>
                            {saveStatus === 'saving' ? 'SAVING...' : 'READY'}
                        </span>
                    </div>
                </div>
            </div>
        </header>
    );
};
