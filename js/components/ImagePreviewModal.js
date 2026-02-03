const { useState, useEffect, useRef } = React;

// Internal Zoomable Image Component (CSS-First Architecture)
const ZoomableImage = ({ src }) => {
    const { Plus, Minus, Maximize } = window;
    const containerRef = useRef(null);
    const [state, setState] = useState({ scale: 1, x: 0, y: 0, isDragging: false, startX: 0, startY: 0 });
    const [hasError, setHasError] = useState(false);

    // Reset state when src changes
    useEffect(() => {
        console.log("ZoomableImage: src changed", src);
        setState({ scale: 1, x: 0, y: 0, isDragging: false, startX: 0, startY: 0 });
        setHasError(false);
    }, [src]);

    const updateState = (updates) => setState(prev => ({ ...prev, ...updates }));

    const handleWheel = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        updateState({ scale: Math.min(Math.max(state.scale * delta, 0.1), 10) });
    };

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
            className="w-full h-full relative overflow-hidden flex items-center justify-center cursor-grab active:cursor-grabbing select-none"
            style={{
                backgroundImage: `linear-gradient(45deg, #1a1a1a 25%, transparent 25%),
                                 linear-gradient(-45deg, #1a1a1a 25%, transparent 25%),
                                 linear-gradient(45deg, transparent 75%, #1a1a1a 75%),
                                 linear-gradient(-45deg, transparent 75%, #1a1a1a 75%)`,
                backgroundSize: '20px 20px',
                backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
                backgroundColor: '#0a0a0a'
            }}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
            {hasError ? (
                <div className="text-gray-500 flex flex-col items-center gap-2">
                    <span className="text-4xl">⚠️</span>
                    <span>无法加载图片</span>
                    <span className="text-xs opacity-50 font-mono max-w-xs truncate">{src}</span>
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

            {/* Controls */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md border border-white/10 rounded-full flex gap-2 p-1.5 z-10 shadow-xl items-center" onClick={e => e.stopPropagation()}>
                <button onClick={() => updateState({ scale: state.scale * 0.8 })} className="p-2 hover:bg-white/10 text-white rounded-full transition"><Minus size={18} /></button>
                <span className="w-12 text-center text-white/90 text-xs font-mono">{Math.round(state.scale * 100)}%</span>
                <button onClick={() => updateState({ scale: state.scale * 1.25 })} className="p-2 hover:bg-white/10 text-white rounded-full transition"><Plus size={18} /></button>
                <div className="w-px bg-white/20 h-4 mx-1"></div>
                <button
                    onClick={() => setState({ scale: 1, x: 0, y: 0, isDragging: false, startX: 0, startY: 0 })}
                    className="p-2 hover:bg-white/10 text-white rounded-full transition"
                    title="重置"
                >
                    <Maximize size={16} />
                </button>
            </div>
        </div>
    );
};

// Exported Preview Modal Component
window.ImagePreviewModal = ({ previewUrl, onClose, items }) => {
    const { X } = window;

    if (!previewUrl) return null;

    // Find associated item ID for display
    let itemId = 0;
    if (items) {
        const item = items.find(i => i.previewUrl === previewUrl || i.orderImage === previewUrl || i.paymentProof === previewUrl);
        if (item) itemId = item.id;
    }

    return (
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className="relative bg-[#141414] rounded-xl overflow-hidden shadow-2xl flex flex-col w-[75vw] h-[80vh] border border-[#2a2a2a]"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex justify-between items-center p-3 border-b border-[#2a2a2a] bg-[#1a1a1a]">
                    <div className="flex items-center gap-2">
                        <span className="font-semibold font-cn text-gray-200">预览</span>
                        {itemId > 0 && <span className="text-xs text-gray-500 font-mono">({itemId})</span>}
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-[#333] rounded-full text-gray-400 hover:text-white transition">
                        <X size={20} />
                    </button>
                </div>
                <div className="flex-1 min-h-0 overflow-hidden bg-[#0a0a0a] relative">
                    <ZoomableImage src={previewUrl} />
                </div>
            </div>
        </div>
    );
};
