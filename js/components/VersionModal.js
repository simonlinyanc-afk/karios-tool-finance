/**
 * VersionModal — v2.0.0 upgrade splash.
 *
 * Thin wrapper around the shared HeroModal shell (variant="upgrade"):
 * long, scrollable copy with a bottom fade mask and a "查看历史更新内容"
 * external secondary link. Business logic (seen flag, data loading) stays in
 * index.html; this component only maps version data onto the shared shell.
 */
window.VersionModal = ({ isOpen, onClose, versionData }) => {
    if (!isOpen || !versionData) return null;

    const title = versionData.title || `Kairos Finance 已升级到 v${versionData.version} 🎉`;
    const intro = versionData.intro || '';
    const changesHeading = versionData.changesHeading || '这次有什么变化？';
    const sections = Array.isArray(versionData.sections) ? versionData.sections : [];
    const heroSrc = versionData.hero || 'assets/upgrade-v2.0.0-hero.webp';
    const heroAlt = versionData.heroAlt || `Kairos Finance 升级到 v${versionData.version}`;
    const historyLink = versionData.historyLink || '';

    return (
        <window.HeroModal
            isOpen={isOpen}
            onClose={onClose}
            variant="upgrade"
            scrollable={true}
            showFadeMask={true}
            heroSrc={heroSrc}
            heroAlt={heroAlt}
            title={title}
            labelId="version-modal-title"
            closeAriaLabel="关闭升级说明"
            primaryActionText="开始使用"
            onPrimaryAction={onClose}
            secondaryActionText="查看历史更新内容"
            secondaryActionHref={historyLink}
        >
            {intro ? (
                <p className="modal-description text-sm leading-relaxed mb-4">{intro}</p>
            ) : null}
            {changesHeading ? (
                <h3 className="hero-modal__section-title modal-title text-sm font-bold font-cn mb-3">
                    {changesHeading}
                </h3>
            ) : null}
            <div className="space-y-4">
                {sections.map((section, index) => (
                    <div key={index} className="hero-modal__section">
                        {section.heading ? (
                            <p className="hero-modal__section-heading modal-title text-sm font-semibold font-cn">
                                {section.heading}
                            </p>
                        ) : null}
                        {section.body ? (
                            <p className="modal-description text-sm leading-relaxed mt-1">
                                {section.body}
                            </p>
                        ) : null}
                    </div>
                ))}
            </div>
        </window.HeroModal>
    );
};
