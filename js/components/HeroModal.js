/**
 * HeroModal — reusable illustrated splash modal shell.
 *
 * Shared by the v2.0.0 upgrade splash (variant="upgrade") and the quick-start
 * guide (variant="guide"). The shell owns the hero image, optional title area,
 * body container and fixed footer actions; the body content itself is passed in
 * as children so each variant can supply its own layout.
 *
 * Props:
 * - isOpen / onClose
 * - heroSrc / heroAlt          top hero image (rendered as an asset)
 * - title / description        optional fixed title area
 * - variant                    'upgrade' | 'guide'
 * - scrollable                 body scrolls (true) or fits content (false)
 * - showFadeMask               show the bottom fade mask over the scroll area
 * - primaryActionText / onPrimaryAction
 * - secondaryActionText / onSecondaryAction / secondaryActionHref
 * - overlayClassName / closeAriaLabel / labelId
 * - children                   replaceable body content
 */
window.HeroModal = ({
    isOpen,
    onClose,
    heroSrc,
    heroAlt = '',
    title,
    description,
    variant = 'upgrade',
    scrollable = true,
    showFadeMask = true,
    primaryActionText = '开始使用',
    onPrimaryAction,
    secondaryActionText,
    onSecondaryAction,
    secondaryActionHref,
    overlayClassName = 'modal-overlay fixed inset-0 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200',
    closeAriaLabel = '关闭',
    labelId = 'hero-modal-title',
    children
}) => {
    const { useState, useEffect, useRef, useCallback } = React;
    const { X, ExternalLink } = window;

    const scrollRef = useRef(null);
    const [showFade, setShowFade] = useState(false);

    const fadeEnabled = scrollable && showFadeMask;

    const updateFade = useCallback(() => {
        if (!fadeEnabled) return;
        const el = scrollRef.current;
        if (!el) return;
        const canScroll = el.scrollHeight > el.clientHeight + 1;
        const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
        // Only show the bottom fade when there is still content below the fold.
        setShowFade(canScroll && !atBottom);
    }, [fadeEnabled]);

    // Escape closes the modal.
    useEffect(() => {
        if (!isOpen) return undefined;
        const handleKeyDown = event => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // Lock background scroll while the modal is open.
    useEffect(() => {
        if (!isOpen) return undefined;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [isOpen]);

    // Recalculate the fade state once the modal opens and its content is laid out.
    useEffect(() => {
        if (!isOpen || !fadeEnabled) return undefined;
        const raf = requestAnimationFrame(updateFade);
        window.addEventListener('resize', updateFade);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('resize', updateFade);
        };
    }, [isOpen, fadeEnabled, updateFade, children]);

    if (!isOpen) return null;

    const hasHead = Boolean(title || description);

    const bodyInner = scrollable ? (
        <div
            ref={scrollRef}
            onScroll={updateFade}
            className="hero-modal__scroll custom-scrollbar px-6 py-4"
        >
            {children}
        </div>
    ) : (
        <div className="hero-modal__content px-6 py-4">{children}</div>
    );

    const renderSecondary = () => {
        if (!secondaryActionText) return null;
        if (secondaryActionHref) {
            return (
                <a
                    href={secondaryActionHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={onSecondaryAction || onClose}
                    className="footer-link inline-flex items-center gap-1.5 text-xs px-2 py-1"
                >
                    <span>{secondaryActionText}</span>
                    <ExternalLink size={12} />
                </a>
            );
        }
        return (
            <button
                type="button"
                onClick={onSecondaryAction}
                className="footer-link text-xs px-2 py-1"
            >
                {secondaryActionText}
            </button>
        );
    };

    return (
        <div
            className={overlayClassName}
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelId}
        >
            <div
                className={`modal-shell hero-modal hero-modal--${variant} rounded-2xl w-full overflow-hidden flex flex-col`}
                onClick={e => e.stopPropagation()}
            >
                {/* Top hero image (rendered as an asset, not re-typeset in HTML/CSS) */}
                <div className="hero-modal__hero-wrap shrink-0">
                    <img
                        src={heroSrc}
                        alt={heroAlt}
                        width="800"
                        height="360"
                        className="hero-modal__hero"
                    />
                    <button
                        onClick={onClose}
                        aria-label={closeAriaLabel}
                        className="modal-close hero-modal__close absolute top-3 right-3 p-1.5 rounded-full"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Optional fixed title area */}
                {hasHead ? (
                    <div className="hero-modal__head shrink-0 px-6 pt-5">
                        {title ? (
                            <h2 id={labelId} className="modal-title text-lg font-bold font-cn">
                                {title}
                            </h2>
                        ) : null}
                        {description ? (
                            <p className="modal-description text-sm leading-relaxed mt-2">{description}</p>
                        ) : null}
                    </div>
                ) : null}

                {/* Replaceable body (scrollable + fade for upgrade, static for guide) */}
                <div className="hero-modal__body">
                    {bodyInner}
                    {fadeEnabled ? (
                        <div
                            className={`hero-modal__fade${showFade ? ' is-visible' : ''}`}
                            aria-hidden="true"
                        ></div>
                    ) : null}
                </div>

                {/* Fixed footer actions */}
                <div className="hero-modal__footer shrink-0 px-6 pb-6 pt-3 flex flex-col items-center gap-3">
                    {renderSecondary()}
                    <button
                        type="button"
                        onClick={onPrimaryAction || onClose}
                        className="btn-primary w-full py-2.5 font-semibold rounded-full transition active:scale-[0.98]"
                    >
                        {primaryActionText}
                    </button>
                </div>
            </div>
        </div>
    );
};
