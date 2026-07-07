const { useState, useEffect, useRef } = React;

// Internal Zoomable Image Component (CSS-First Architecture)
const ZoomableImage = ({ src, onDelete }) => {
    const { Plus, Minus, Maximize, Trash2 } = window;
    const containerRef = useRef(null);
    const [state, setState] = useState({ scale: 1, x: 0, y: 0, isDragging: false, startX: 0, startY: 0 });
    const [hasError, setHasError] = useState(false);

    // Reset state when src changes
    useEffect(() => {
        setState({ scale: 1, x: 0, y: 0, isDragging: false, startX: 0, startY: 0 });
        setHasError(false);
    }, [src]);

    const updateState = (updates) => setState(prev => ({ ...prev, ...updates }));

    // Fix: Attach non-passive wheel listener manually to support preventDefault
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const onWheel = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            setState(prev => ({ ...prev, scale: Math.min(Math.max(prev.scale * delta, 0.1), 10) }));
        };

        container.addEventListener('wheel', onWheel, { passive: false });
        return () => container.removeEventListener('wheel', onWheel);
    }, []);

    // Other handlers remain as React Synthetic Events
    const handleMouseDown = (e) => {
        e.preventDefault();
        updateState({ isDragging: true, startX: e.clientX - state.x, startY: e.clientY - state.startY });
    };

    const handleMouseMove = (e) => {
        if (!state.isDragging) return;
        e.preventDefault();
        updateState({ x: e.clientX - state.startX, y: e.clientY - state.startY });
    };

    const handleMouseUp = () => updateState({ isDragging: false });

    return (
        <div
            ref={containerRef}
            className="image-preview-viewport w-full h-full relative overflow-hidden flex items-center justify-center cursor-grab active:cursor-grabbing select-none"
            // onWheel removed - handled by Effect
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
            {hasError ? (
                <div className="modal-subtle flex flex-col items-center gap-2">
                    <span className="text-4xl">⚠️</span>
                    <span>无法加载图片</span>
                    <span className="text-xs opacity-50 font-mono max-w-xs truncate">
                        {typeof src === 'string' ? src : 'Invalid Source Type'}
                    </span>
                </div>
            ) : (
                <img
                    src={src}
                    draggable={false}
                    className="w-full h-full object-contain pointer-events-none block"
                    style={{
                        transform: `translate(${state.x}px, ${state.y}px) scale(${state.scale})`,
                        transition: state.isDragging ? 'none' : 'transform 0.1s ease-out',
                        transformOrigin: 'center',
                        willChange: 'transform',
                        maxWidth: '100%',
                        maxHeight: '100%'
                    }}
                    onLoad={(e) => {
                        console.log("Image loaded successfully:", src, e.target.naturalWidth, e.target.naturalHeight);
                    }}
                    onError={(e) => {
                        console.error("Image load error:", src, e);
                        setHasError(true);
                    }}
                />
            )}

            {/* Controls Container */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 z-10" onClick={e => e.stopPropagation()}>
                {/* Zoom Controls */}
                <div className="image-preview-toolbar rounded-full flex gap-2 p-1.5 items-center">
                    <button onClick={() => updateState({ scale: state.scale * 0.8 })} className="p-2 rounded-full transition" aria-label="缩小图片"><Minus size={18} /></button>
                    <span className="preview-zoom-value w-12 text-center text-xs font-mono">{Math.round(state.scale * 100)}%</span>
                    <button onClick={() => updateState({ scale: state.scale * 1.25 })} className="p-2 rounded-full transition" aria-label="放大图片"><Plus size={18} /></button>
                    <div className="w-px h-4 mx-1 modal-divider border-l"></div>
                    <button
                        onClick={() => setState({ scale: 1, x: 0, y: 0, isDragging: false, startX: 0, startY: 0 })}
                        className="p-2 rounded-full transition"
                        title="重置"
                        aria-label="重置图片缩放"
                    >
                        <Maximize size={16} />
                    </button>
                </div>

                {/* Separate Delete Button */}
                {onDelete && (
                    <button
                        onClick={onDelete}
                        className="bg-red-500/20 hover:bg-red-500/40 text-red-400 p-3 rounded-full backdrop-blur-md border border-red-500/10 shadow-xl transition flex items-center justify-center cursor-pointer"
                        title="删除此文件"
                    >
                        <Trash2 size={18} />
                    </button>
                )}
            </div>
        </div>
    );
};

// Exported Preview Modal Component
window.ImagePreviewModal = ({ previewUrl, onClose, items, updateItem, requestConfirm }) => {
    const { X, ChevronLeft, ChevronRight, Trash2 } = window;
    const [currentIndex, setCurrentIndex] = useState(0);
    const [currentImages, setCurrentImages] = useState([]);
    const [activeUrl, setActiveUrl] = useState(null);
    const [context, setContext] = useState(null); // { itemId, field }

    // Initialize: Detect context (Is this part of a multi-image set?)
    useEffect(() => {
        if (!previewUrl || !items) {
            setActiveUrl(previewUrl);
            setCurrentImages([]);
            setContext(null);
            return;
        }

        // Find the item and specific property that contains the previewUrl
        let found = false;

        for (const item of items) {
            // Check Payment Proof (Legacy Support)
            if (Array.isArray(item.paymentProof) && item.paymentProof.includes(previewUrl)) {
                setCurrentImages(item.paymentProof);
                setCurrentIndex(item.paymentProof.indexOf(previewUrl));
                setActiveUrl(previewUrl);
                setContext({ itemId: item.id, field: 'paymentProof' });
                found = true;
                break;
            }

            // Check new Attachments Column
            const attachments = Array.isArray(item.attachments) ? item.attachments : [];
            const attachIndex = attachments.indexOf(previewUrl);
            if (attachIndex !== -1) {
                setCurrentImages(attachments);
                setCurrentIndex(attachIndex);
                setActiveUrl(previewUrl);
                setContext({ itemId: item.id, field: 'attachments' });
                found = true;
                break;
            }

            // Check standard fields
            if (item.previewUrl === previewUrl) {
                setCurrentImages([]);
                setActiveUrl(previewUrl);
                setContext({ itemId: item.id, field: 'previewUrl' });
                found = true;
                break;
            }
            if (item.orderImage === previewUrl) {
                setCurrentImages([]);
                setActiveUrl(previewUrl);
                setContext({ itemId: item.id, field: 'orderImage' });
                found = true;
                break;
            }
        }

        if (!found) {
            // Fallback
            setActiveUrl(previewUrl);
            setCurrentImages([]);
            setContext(null);
        }
    }, [previewUrl, items]);

    const handleNext = (e) => {
        e?.stopPropagation();
        if (currentImages.length <= 1) return;
        const next = (currentIndex + 1) % currentImages.length;
        setCurrentIndex(next);
        setActiveUrl(currentImages[next]);
    };

    const handlePrev = (e) => {
        e?.stopPropagation();
        if (currentImages.length <= 1) return;
        const prev = (currentIndex - 1 + currentImages.length) % currentImages.length;
        setCurrentIndex(prev);
        setActiveUrl(currentImages[prev]);
    };

    const handleJumpTo = (index) => {
        if (index >= 0 && index < currentImages.length) {
            setCurrentIndex(index);
            setActiveUrl(currentImages[index]);
        }
    };

    const handleDelete = async (e) => {
        e.stopPropagation();
        if (!context || !updateItem) return;

        const confirmed = requestConfirm
            ? await requestConfirm({
                title: '删除这张图片？',
                description: '删除后无法恢复。请确认这张图片不再需要作为报销附件。',
                confirmText: '确认删除',
                cancelText: '取消',
                variant: 'danger'
            })
            : true;
        if (!confirmed) return;

        const { itemId, field } = context;

        if (currentImages.length > 0) {
            // Array Mode
            const newImages = currentImages.filter((_, i) => i !== currentIndex);
            updateItem(itemId, field, newImages.length > 0 ? newImages : null);

            if (newImages.length === 0) {
                onClose();
            } else {
                // Stay within bounds
                const newIndex = currentIndex >= newImages.length ? newImages.length - 1 : currentIndex;
                setCurrentIndex(newIndex);
                setCurrentImages(newImages); // Optimistic UI update
                setActiveUrl(newImages[newIndex]);
            }
        } else {
            // Single Mode
            updateItem(itemId, field, null);
            onClose();
        }
    };

    if (!activeUrl) return null;

    return (
        <div
            className="image-preview-overlay fixed inset-0 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className="image-preview-shell relative rounded-xl overflow-hidden flex flex-col w-[85vw] h-[90vh]"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="image-preview-header flex justify-between items-center p-4 border-b">
                    <div className="flex items-center gap-3">
                        <span className="modal-title font-semibold font-cn">预览</span>
                        {currentImages.length > 1 && (
                            <span className="fixed-column-badge text-xs font-mono px-2 py-0.5 rounded">
                                {currentIndex + 1} / {currentImages.length}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">

                        <button onClick={onClose} className="modal-close p-2 rounded-full transition" aria-label="关闭预览">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Main Viewport */}
                <div className="flex-1 min-h-0 relative group">
                    <ZoomableImage
                        src={activeUrl}
                        onDelete={updateItem && context ? handleDelete : null}
                    />

                    {/* Navigation Arrows */}
                    {currentImages.length > 1 && (
                        <>
                            <button
                                onClick={handlePrev}
                                className="image-preview-nav absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                aria-label="上一张"
                            >
                                <ChevronLeft size={24} />
                            </button>
                            <button
                                onClick={handleNext}
                                className="image-preview-nav absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                aria-label="下一张"
                            >
                                <ChevronRight size={24} />
                            </button>
                        </>
                    )}
                </div>

                {/* Thumbs Strip */}
                {currentImages.length > 1 && (
                    <div className="image-preview-thumbs h-20 border-t flex items-center justify-center p-2 gap-2 overflow-x-auto custom-scrollbar">
                        {currentImages.map((img, idx) => (
                            <div
                                key={idx}
                                onClick={() => handleJumpTo(idx)}
                                className={`h-14 w-14 shrink-0 rounded cursor-pointer border-2 transition overflow-hidden relative ${idx === currentIndex ? 'border-yellow-500 opacity-100' : 'border-transparent opacity-50 hover:opacity-80'
                                    }`}
                            >
                                <img src={img} className="w-full h-full object-cover" />
                                {idx === currentIndex && (
                                    <div className="absolute inset-0 bg-yellow-500/10 pointer-events-none"></div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
