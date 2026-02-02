// Utility functions for Yellow Bird Finance
// These functions are in the global scope to be accessible by index.html

/**
 * Format currency with robust checks
 * @param {number|string} amount 
 * @returns {string} Formatted currency string (e.g. "100.00")
 */
function formatCurrency(amount) {
    if (amount === undefined || amount === null || isNaN(Number(amount))) return "0.00";
    return Number(amount).toFixed(2);
}

/**
 * Convert PDF to Image using PDF.js
 * Depends on pdfjsLib being loaded before this script
 * @param {File} file 
 * @returns {Promise<File|null>}
 */
async function convertPDFToImage(file) {
    if (typeof pdfjsLib === 'undefined') {
        console.error('PDF.js library not loaded');
        return null;
    }

    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1); // Get first page
        const viewport = page.getViewport({ scale: 2 }); // 2x scale for better quality

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({
            canvasContext: canvas.getContext('2d'),
            viewport
        }).promise;

        // Convert canvas to blob and return as File object
        return new Promise((resolve) => {
            canvas.toBlob((blob) => {
                if (!blob) {
                    resolve(null);
                    return;
                }
                const imageFile = new File([blob], file.name.replace('.pdf', '.png'), { type: 'image/png' });
                resolve(imageFile);
            }, 'image/png');
        });
    } catch (error) {
        console.error('PDF conversion error:', error);
        return null;
    }
}

/**
 * Convert Blob URL to Base64
 * @param {string} url 
 * @returns {Promise<string|null>}
 */
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
    } catch (error) {
        console.error('Blob to base64 conversion error:', error);
        return null;
    }
}

/**
 * Resize/Compress Image for PDF export
 * @param {string} url 
 * @param {number} quality - Image quality (0.0 - 1.0), default 0.85
 * @returns {Promise<string|null>} Base64 string of resized image
 */
async function resizeImage(url, quality = 0.85) {
    if (!url) return null;
    console.log('🖼️ Starting resizeImage for:', url.substring(0, 60));
    try {
        // Step 1: Convert to Base64 FIRST (this is our safety net)
        let base64Data = null;
        if (url.startsWith('data:image')) {
            // Already Base64, use directly
            base64Data = url;
            console.log('✅ Already Base64 format');
        } else if (url.startsWith('blob:')) {
            // Convert Blob URL to Base64 using fetch + FileReader
            console.log('🔄 Converting Blob URL to Base64...');
            const response = await fetch(url);
            const blob = await response.blob();
            base64Data = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
            console.log('✅ Base64 conversion successful, length:', base64Data.length);
        } else {
            // Unknown format, return null
            console.warn('⚠️ Unknown URL format:', url.substring(0, 60));
            return null;
        }
        // Step 2: Try to optimize/resize (with timeout protection)
        const optimized = await Promise.race([
            // Optimization attempt
            new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    try {
                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d');
                        const maxDim = 800;
                        let width = img.width;
                        let height = img.height;
                        // Calculate new dimensions
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
                        ctx.drawImage(img, 0, 0, width, height);
                        const resized = canvas.toDataURL('image/jpeg', quality);
                        console.log('✅ Image optimized:', width + 'x' + height, 'size:', resized.length, 'quality:', quality);
                        resolve(resized);
                    } catch (err) {
                        console.error('❌ Canvas error:', err);
                        resolve(base64Data); // Fallback to original Base64
                    }
                };
                img.onerror = (e) => {
                    console.error('❌ Image load error:', e);
                    resolve(base64Data); // Fallback to original Base64
                };
                img.src = base64Data; // Use Base64, not Blob URL!
            }),
            // 2-second timeout
            new Promise((resolve) => {
                setTimeout(() => {
                    console.warn('⏱️ Resize timeout, using original Base64');
                    resolve(base64Data);
                }, 2000);
            })
        ]);
        return optimized;
    } catch (error) {
        console.error('❌ Fatal error in resizeImage:', error);
        return null;
    }
}

/**
 * Calculate tax and totals based on updated field
 * @param {object} item - The current item object
 * @param {string} field - The field being updated
 * @param {any} value - The new value for the field
 * @returns {object} The updated item object
 */
function calculateTax(item, field, value) {
    // 0. Handle non-financial fields simply
    const financialFields = ['subtotal', 'tax', 'amount', 'totalWithTax'];
    if (!financialFields.includes(field)) {
        return { ...item, [field]: value };
    }

    // 1. Basic conversion, handle empty string and invalid input
    // Use Number() for strict conversion but handle '' explicitly as 0
    const numValue = (value === '' || value === null || value === undefined) ? 0 : parseFloat(value);

    // Initialize newItem with the *numeric* value for calculation, 
    // but we will format it at the end. Use a temp object for calculation.
    let newItem = { ...item };

    // Update the field being changed
    newItem[field] = numValue;

    // Get current values of other fields (safe parsing)
    // Note: Use 'amount' as 'total' locally logic-wise
    let subtotal = parseFloat(newItem.subtotal) || 0;
    let tax = parseFloat(newItem.tax) || 0;
    let total = parseFloat(newItem.amount) || 0; // 'amount' is the Total Amount

    // Update the specific variable for the field being changed to the new numValue
    if (field === 'subtotal') subtotal = numValue;
    if (field === 'tax') tax = numValue;
    if (field === 'amount') total = numValue; // Map 'amount' input to total logic

    // 2. Linkage Logic based on User Rules
    if (field === 'subtotal') {
        // Change Subtotal: Keep Tax constant (by amount), Recalc Total
        // Rule: total = subtotal + tax
        total = subtotal + tax;
        newItem.amount = total.toFixed(2);
    }
    else if (field === 'tax') {
        // Change Tax: Keep Subtotal constant, Recalc Total
        // Rule: total = subtotal + tax
        total = subtotal + tax;
        newItem.amount = total.toFixed(2);
    }
    else if (field === 'amount') { // 'total'
        // Change Total: Keep Tax constant, Recalc Subtotal
        // Rule: subtotal = total - tax
        subtotal = total - tax;
        newItem.subtotal = subtotal.toFixed(2);
    }

    // 3. Format the modified field itself and sync totalWithTax
    // User requested .toFixed(2) on return.
    newItem[field] = numValue.toFixed(2); // Format the input field too

    // Ensure all financial fields are strings with 2 decimals for consistency
    if (field !== 'subtotal') newItem.subtotal = subtotal.toFixed(2);
    if (field !== 'tax') newItem.tax = tax.toFixed(2);
    if (field !== 'amount') newItem.amount = total.toFixed(2);

    // Sync legacy/internal field
    newItem.totalWithTax = newItem.amount;

    return newItem;
}

/**
 * Process OCR API Response and return a new item object
 * @param {object} data - The data returned from the OCR API
 * @param {File} file - The original file
 * @param {boolean} isPDF - Whether the file is a PDF
 * @param {string} convertedImageUrl - URL of the converted image if PDF
 * @param {object} reimbursementInfo - Check for default values
 * @param {number} index - Index for unique ID generation
 * @returns {object} New Item Object
 */
function processOCRResponse(data, file, isPDF, convertedImageUrl, reimbursementInfo, index) {
    // Generate a unique ID (mixing timestamp, index, and random to be safe)
    const id = Date.now() + index + Math.random();

    return {
        id: id,
        file: file,
        isPDF: isPDF,
        previewUrl: convertedImageUrl || URL.createObjectURL(file), // Use converted image if available
        preview: convertedImageUrl || null, // Store converted image in preview field
        date: data.date || "",
        category: data.category || "其他",
        description: data.description || file.name,
        amount: data.amount ? parseFloat(data.amount) : 0, // Total after tax
        tax: data.tax ? parseFloat(data.tax) : 0,
        itemName: data.itemName || "",
        specification: data.specification || "",
        unit: data.unit || "",
        quantity: data.quantity || 0,
        unitPrice: data.unitPrice || 0,
        taxRate: data.taxRate || "",
        subtotal: data.subtotal ? parseFloat(data.subtotal) : 0, // Pre-tax amount
        totalWithTax: data.amount ? parseFloat(data.amount) : 0, // Sync with 'amount'
        invoiceNumber: data.invoiceNumber || "",
        buyerName: data.buyerName || "",
        sellerName: data.sellerName || "",
        attachments: [],
        remarks: data.remarks || "",
        reimburser: reimbursementInfo.reimburser || "",
        project: reimbursementInfo.project || ""
    };
}

/**
 * Create a fallback item when processing fails
 * @param {File} file 
 * @param {boolean} isPDF 
 * @param {Error} error 
 * @param {object} reimbursementInfo 
 * @param {number} index 
 * @returns {object}
 */
function createFailedItem(file, isPDF, error, reimbursementInfo, index) {
    const id = Date.now() + index + Math.random();
    return {
        id: id,
        file: file,
        isPDF: isPDF,
        previewUrl: URL.createObjectURL(file),
        date: new Date().toISOString().split('T')[0],
        amount: 0,
        tax: 0,
        category: "其他",
        description: `识别失败：${file.name} (${error?.message || error})`,
        itemName: "",
        specification: "",
        unit: "",
        quantity: 0,
        unitPrice: 0,
        taxRate: "",
        subtotal: 0,
        totalWithTax: 0,
        invoiceNumber: "",
        buyerName: "",
        sellerName: "",
        attachments: [],
        remarks: "",
        reimburser: reimbursementInfo.reimburser || "",
        project: reimbursementInfo.project || ""
    };
}
