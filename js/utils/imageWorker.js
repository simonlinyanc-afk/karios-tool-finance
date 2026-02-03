/**
 * Image Processing Web Worker
 * Handles off-main-thread image resizing and compression using OffscreenCanvas.
 */

self.onmessage = async function (e) {
    const { id, type, data } = e.data;

    try {
        if (type === 'resize') {
            const result = await handleResize(data);
            self.postMessage({ id, success: true, result });
        } else {
            throw new Error(`Unknown operation: ${type}`);
        }
    } catch (error) {
        self.postMessage({
            id,
            success: false,
            error: error.message || 'Worker Error'
        });
    }
};

/**
 * Handle Resize Operation
 * @param {Object} params - { source (Blob/Bitmap), maxDim, quality }
 */
async function handleResize({ source, maxDim, quality }) {
    let bitmap;

    // 0. Resolve Source (Handle Blob URLs)
    let imageSource = source;
    if (typeof source === 'string') {
        try {
            const response = await fetch(source);
            imageSource = await response.blob();
        } catch (e) {
            throw new Error(`Failed to fetch source URL: ${e.message}`);
        }
    }

    // 1. Create ImageBitmap from Source
    if (imageSource instanceof Blob) {
        bitmap = await createImageBitmap(imageSource);
    } else if (imageSource instanceof ImageBitmap) {
        bitmap = imageSource;
    } else {
        throw new Error(`Invalid source type for worker: ${typeof source}`);
    }

    const { width, height } = bitmap;

    // 2. Calculate New Dimensions
    let newWidth = width;
    let newHeight = height;

    if (width > height && width > maxDim) {
        newHeight = Math.round(height * (maxDim / width));
        newWidth = maxDim;
    } else if (height >= width && height > maxDim) {
        newWidth = Math.round(width * (maxDim / height));
        newHeight = maxDim;
    }

    // 3. Draw to OffscreenCanvas
    const canvas = new OffscreenCanvas(newWidth, newHeight);
    const ctx = canvas.getContext('2d');

    ctx.drawImage(bitmap, 0, 0, newWidth, newHeight);

    // 4. Compress and Export
    // Using 'image/jpeg' as standard standard for photos
    const blob = await canvas.convertToBlob({
        type: 'image/jpeg',
        quality: quality || 0.7
    });

    bitmap.close();

    // Convert to ArrayBuffer/DataURL to send back? 
    // Actually, sending Blob back is efficient (Transferable-like). 
    // But main thread expects DataURL string for display/storage usually?
    // Let's return Blob, main thread can create URL or FileReader.
    // Wait, existing code expects DataURL (base64 string) from resizeCanvas.
    // To match existing API, we should convert to Reader here or in Main.
    // Doing it here saves Main thread time.

    return await blobToDataURL(blob);
}

/**
 * Helper: Convert Blob to DataURL in Worker
 */
function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}
