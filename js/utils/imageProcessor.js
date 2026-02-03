// Image Processing Utilities (Single Stream V2)
// Unified 1500px/0.7 Quality for UI, Storage, and API.

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Calculate MD5 Hash of a File (with 20s Timeout)
 */
async function calculateFileHash(file) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve("timeout-hash-" + Date.now()), 20000);

        if (typeof SparkMD5 === 'undefined') {
            console.error("SparkMD5 库未加载！");
            clearTimeout(timer);
            return resolve("no-hash-" + Date.now());
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            clearTimeout(timer);
            const spark = new SparkMD5.ArrayBuffer();
            spark.append(e.target.result);
            resolve(spark.end());
        };
        reader.onerror = (e) => {
            clearTimeout(timer);
            console.error("Hash calculation failed", e);
            resolve("error-hash-" + Date.now());
        };
        reader.readAsArrayBuffer(file);
    });
}

/**
 * Universal Resize Helper (Canvas) with 40s Timeout
 * Enforces 1500px limit and 0.7 quality by default
 */
async function resizeCanvas(source, maxDim = 1500, quality = 0.7, isFile = true) {
    return new Promise((resolve) => {
        let objectUrl = null;

        const cleanup = () => {
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
                objectUrl = null;
            }
        };

        const timer = setTimeout(() => {
            console.error("ResizeCanvas Timeout (40s)");
            cleanup();
            resolve(null);
        }, 40000);

        if (!source) {
            console.error('ResizeCanvas: Source is null or undefined');
            clearTimeout(timer);
            resolve(null);
            return;
        }

        const img = new Image();
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                let width = img.width;
                let height = img.height;

                // Scale Logic
                if (width > height && width > maxDim) {
                    height = Math.round(height * (maxDim / width));
                    width = maxDim;
                } else if (height >= width && height > maxDim) {
                    width = Math.round(width * (maxDim / height));
                    height = maxDim;
                }

                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);

                const dataUrl = canvas.toDataURL('image/jpeg', quality);

                // Cleanup
                clearTimeout(timer);
                cleanup();

                resolve(dataUrl);
            } catch (e) {
                console.error("Canvas draw error:", e);
                clearTimeout(timer);
                cleanup();
                resolve(null);
            }
        };

        img.onerror = () => {
            console.error('ResizeCanvas: Failed to load image source');
            clearTimeout(timer);
            cleanup();
            resolve(null);
        };

        try {
            if (isFile) {
                objectUrl = URL.createObjectURL(source);
                img.src = objectUrl;
            } else {
                img.src = source; // Handle Base64 or URL strings
            }
        } catch (e) {
            console.error('ResizeCanvas: Error setting src', e);
            clearTimeout(timer);
            cleanup();
            resolve(null);
        }
    });
}

/**
 * Legacy Resizer Alias
 */
async function resizeImage(url, quality = 0.7) {
    return resizeCanvas(url, 1500, quality, false);
}

/**
 * Single Stream Strategy: 1500px, 0.7 Quality
 * Returns unified compressedBase64 for all uses.
 */
async function processImage(file) {
    // 0. Breathing Room
    await sleep(200);

    // 1. Calculate Hash
    const fileHash = await calculateFileHash(file);
    const id = Date.now() + Math.random();

    console.log(`[ImageProcessor] Processing ${file.name} (Hash: ${fileHash.substring(0, 8)}...)`);

    // 2. Resize to 1500px @ 0.7 Quality
    // Note: PDF conversion might attach _precomputedBase64, we can optionally use it
    let compressedBase64;
    if (file._precomputedBase64) {
        // Assume precomputed is already sized correctly or use it as is
        compressedBase64 = file._precomputedBase64;
    } else {
        // FIX: Ensure isFile is explicitly true for File objects
        compressedBase64 = await resizeCanvas(file, 1500, 0.7, true);
    }

    if (!compressedBase64) {
        console.error(`[ImageProcessor] Failed to process ${file.name}`);
    }

    return {
        id,
        fileHash,
        compressedBase64,
        file
    };
}

/**
 * Convert PDF to Image using PDF.js
 * 20s Timeout, Local CMaps, Returns File object (JPEG)
 */
async function convertPDFToImage(file) {
    if (typeof pdfjsLib === 'undefined') {
        console.error('PDF.js library not loaded');
        return null;
    }

    let canvas = null;

    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("PDF Processing Timeout")), 20000)
    );

    try {
        const processPromise = (async () => {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({
                data: arrayBuffer,
                cMapUrl: 'libs/cmaps/',
                cMapPacked: true
            }).promise;
            const page = await pdf.getPage(1);

            const viewportRaw = page.getViewport({ scale: 1 });
            const maxDim = 1800; // Target 1800px directly
            let scale = 1;

            // Calculate scale to match maxDim (Upscale small PDFs, Downscale large ones)
            if (viewportRaw.width > viewportRaw.height) {
                scale = maxDim / viewportRaw.width;
            } else {
                scale = maxDim / viewportRaw.height;
            }

            const viewport = page.getViewport({ scale });
            canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');

            await page.render({ canvasContext: ctx, viewport }).promise;

            const quality = 0.7;
            const dataUrl = canvas.toDataURL('image/jpeg', quality);

            return new Promise((resolve) => {
                canvas.toBlob((blob) => {
                    if (!blob) { resolve(null); return; }
                    const newName = file.name.replace(/\.pdf$/i, '.jpg');
                    const newFile = new File([blob], newName, { type: 'image/jpeg' });
                    // Optional: Attach base664 to avoid re-decoding in processImage
                    newFile._precomputedBase64 = dataUrl;
                    resolve(newFile);
                }, 'image/jpeg', quality);
            });
        })();

        return await Promise.race([processPromise, timeoutPromise]);

    } catch (error) {
        console.error('PDF conversion error:', error);
        return null;
    } finally {
        // Manual Cleanup
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
            canvas.width = 0; canvas.height = 0; canvas = null;
        }
    }
}

async function blobToBase64(url) {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) { return null; }
}

// Global Export
window.calculateFileHash = calculateFileHash;
window.resizeCanvas = resizeCanvas;
window.resizeImage = resizeImage;
window.processImage = processImage;
window.convertPDFToImage = convertPDFToImage;
window.blobToBase64 = blobToBase64;
// window.optimizeForOcr removed
