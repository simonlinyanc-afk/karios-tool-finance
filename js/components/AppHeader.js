const THEME_OPTIONS = [
    { value: 'system', label: '跟随系统' },
    { value: 'light', label: '浅色' },
    { value: 'dark', label: '深色' }
];

window.AppHeader = ({ autoSaveEnabled, setAutoSaveEnabled, saveStatus, onOpenHistory }) => {
    const { Clock } = window;
    const [themePreference, setThemePreference] = React.useState(() => {
        return window.KairosTheme?.getPreference?.() || 'system';
    });

    React.useEffect(() => {
        if (!window.KairosTheme?.subscribe) return undefined;
        return window.KairosTheme.subscribe(({ preference }) => {
            setThemePreference(preference);
        });
    }, []);

    const handleThemeChange = (preference) => {
        const nextTheme = window.KairosTheme?.setPreference?.(preference);
        setThemePreference(nextTheme?.preference || preference);
    };

    return (
        <header className="app-header px-4 py-4 sm:px-8">
            <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <a href="#root" className="app-header__brand rounded-lg focus-visible:outline-none" aria-label="Kairos Finance 首页">
                    <img src="assets/Kairos Finance Black.svg" alt="Kairos Finance" width={180} height={40} className="app-logo app-logo--light" />
                    <img src="assets/Kairos Finance.svg" alt="" aria-hidden="true" width={180} height={40} className="app-logo app-logo--dark" />
                </a>
                <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                    <div className="theme-toggle" role="group" aria-label="切换界面主题">
                        {THEME_OPTIONS.map(option => (
                            <button
                                key={option.value}
                                type="button"
                                aria-pressed={themePreference === option.value}
                                onClick={() => handleThemeChange(option.value)}
                                className={`theme-toggle__button ${themePreference === option.value ? 'is-active' : ''}`}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>

                    {onOpenHistory && (
                        <button
                            type="button"
                            onClick={onOpenHistory}
                            className="app-header__history-button font-cn"
                            aria-label="打开历史记录"
                        >
                            <Clock aria-hidden="true" size={14} />
                            <span>历史记录</span>
                        </button>
                    )}

                    <button
                        type="button"
                        role="switch"
                        aria-checked={autoSaveEnabled}
                        onClick={() => setAutoSaveEnabled(enabled => !enabled)}
                        className="autosave-toggle"
                    >
                        <span aria-hidden="true" className={`autosave-toggle__track ${autoSaveEnabled ? 'is-on' : ''}`}>
                            <span className={`autosave-toggle__thumb ${autoSaveEnabled ? 'is-on' : ''}`} />
                        </span>
                        <span className="autosave-toggle__label font-cn">
                            {autoSaveEnabled ? '自动保存已开启' : '自动保存已关闭'}
                        </span>
                    </button>

                    <div className={`save-status ${saveStatus === 'saving' ? 'is-saving' : 'is-saved'}`} aria-live="polite" aria-atomic="true">
                        <span aria-hidden="true" className="save-status__dot" />
                        <span className="save-status__label font-cn">
                            {saveStatus === 'saving' ? '正在保存…' : '已保存'}
                        </span>
                    </div>
                </div>
            </div>
        </header>
    );
};
