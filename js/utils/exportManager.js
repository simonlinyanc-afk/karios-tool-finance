/**
 * Export Manager for Yellow Bird Finance
 * Handles Excel and Print/PDF export functionality
 * Depends on: ExcelJS, finance.js (for resizeImage)
 */

/**
 * Export to Excel with robust image support and formatting
 * Uses Parallel Processing for images to improve performance
 * @param {Array} items
 * @param {Array} columns
 * @param {Object} reimbursementInfo
 * @param {Function} onProgress - Callback for progress updates ({ processed, total, message })
 */
async function exportToExcel(items, columns, reimbursementInfo, onProgress = () => { }) {
    if (typeof ExcelJS === 'undefined') {
        alert('ExcelJS 库未加载，无法导出');
        return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('报销单');

    // Filter visible columns (exclude interactive columns)
    const visibleColumns = columns.filter(c => c.visible && c.id !== 'actions');

    const totalCols = visibleColumns.length;
    const lastColLetter = String.fromCharCode(64 + totalCols); // Simple A-Z mapping

    // --- Header Section (Rows 1-3) ---

    // Row 1: Title
    const titleRow = worksheet.addRow(['报销单']);
    worksheet.mergeCells(`A1:${lastColLetter}1`);
    titleRow.height = 30;
    titleRow.getCell(1).font = { size: 18, bold: true };
    titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

    // Row 2: Basic Info
    const infoRow = worksheet.addRow([
        `报销人: ${reimbursementInfo.reimburser || ''}    项目: ${reimbursementInfo.project || ''}    日期: ${reimbursementInfo.reimbursementDate || ''}`
    ]);
    worksheet.mergeCells(`A2:${lastColLetter}2`);
    infoRow.height = 20;
    infoRow.getCell(1).font = { size: 12, bold: true };
    infoRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

    // Row 3: Payment Info
    const paymentRow = worksheet.addRow([`打款信息: ${reimbursementInfo.paymentInfo || '未填写'}`]);
    worksheet.mergeCells(`A3:${lastColLetter}3`);
    paymentRow.height = 20;
    paymentRow.getCell(1).font = { size: 12, bold: true };
    paymentRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };

    // Row 4: Spacer
    worksheet.addRow([]);

    // --- Table Header (Row 5) ---
    const headerRow = worksheet.addRow(visibleColumns.map(c => c.label));
    headerRow.height = 25;
    headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF444444' }
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        };
    });

    // --- Data Processing with Images (Parallel) ---

    // Pre-process all images in parallel for speed
    // This creates a map: itemIndex -> { colId -> { base64, width, height } }
    const imageMap = {};
    const imageTasks = [];
    let totalImages = 0;
    let processedImages = 0;

    items.forEach((item, index) => {
        visibleColumns.forEach(col => {
            if (['preview', 'orderImage', 'paymentProof', 'attachments'].includes(col.id)) {
                let imageUrl = null;
                if (col.id === 'preview') imageUrl = item.previewUrl || item.preview;
                else if (col.id === 'orderImage') imageUrl = item.orderImageUrl || item.orderImage;
                else if (col.id === 'paymentProof') imageUrl = item.paymentProofUrl || item.paymentProof;
                else if (col.id === 'attachments') imageUrl = item.attachments;

                if (imageUrl) {
                    // Extract as array to handle single or multiple
                    const urls = Array.isArray(imageUrl) ? imageUrl : [imageUrl];

                    urls.forEach((url, imgIdx) => {
                        // Count total tasks first
                        totalImages++;
                        imageTasks.push((async () => {
                            try {
                                let finalBase64 = null;

                                // Optimization logic (simplified for loop)
                                if (col.id === 'preview' && item.compressedBase64 && imgIdx === 0) {
                                    finalBase64 = item.compressedBase64;
                                }
                                else if (typeof url === 'string' && url.startsWith('data:image')) {
                                    finalBase64 = url;
                                }
                                else {
                                    if (typeof resizeImage !== 'function') return;
                                    finalBase64 = await resizeImage(url, 0.6);
                                }

                                if (finalBase64) {
                                    // Measure dimensions
                                    const dimensions = await new Promise((resolve) => {
                                        const img = new Image();
                                        img.onload = () => resolve({ w: img.width, h: img.height });
                                        img.onerror = () => resolve({ w: 100, h: 100 });
                                        img.src = finalBase64;
                                        setTimeout(() => resolve({ w: 100, h: 100 }), 500);
                                    });

                                    if (!imageMap[index]) imageMap[index] = {};
                                    if (!imageMap[index][col.id]) imageMap[index][col.id] = [];

                                    imageMap[index][col.id].push({
                                        base64: finalBase64,
                                        width: dimensions.w,
                                        height: dimensions.h
                                    });
                                }
                            } catch (e) {
                                console.warn('Failed to process image', e);
                            } finally {
                                processedImages++;
                                onProgress({
                                    processed: processedImages,
                                    total: totalImages,
                                    message: `正在处理图片 ${processedImages}/${totalImages}`
                                });
                            }
                        })());
                    });
                }
            }
        });
    });

    // Wait for all processing to complete
    if (imageTasks.length > 0) {
        onProgress({ processed: 0, total: totalImages, message: '准备处理图片...' });
        await Promise.all(imageTasks);
    }

    onProgress({ processed: totalImages, total: totalImages, message: '正在生成 Excel 文件...' });

    // --- Row Generation ---
    for (let i = 0; i < items.length; i++) {
        // ... (Row creation same as before)
        const item = items[i];
        const rowValues = visibleColumns.map(col => {
            if (['preview', 'orderImage', 'paymentProof', 'attachments'].includes(col.id)) return '';
            return item[col.id];
        });
        const row = worksheet.addRow(rowValues);
        const rowIndex = row.number;

        // Check for images
        let hasImage = false;
        if (imageMap[i]) {
            visibleColumns.forEach((col, colIdx) => {
                if (imageMap[i][col.id] && imageMap[i][col.id].length > 0) {
                    hasImage = true;
                    // Force single image for preview/order/proof, multi for attachments
                    // Actually our processing logic returns array for all.
                    // But for these standard columns, we usually only want the first one if it happens to be array?
                    // well paymentProof was multi before, now single. 
                    // Let's just render whatever comes back.
                    const images = imageMap[i][col.id];

                    let currentXOffset = 0.1;

                    // Multi-image layout (e.g., attachments)
                    if (col.id === 'attachments') {
                        images.forEach(imgData => {
                            const maxW = 40; const maxH = 60; // Slightly narrower for multi
                            // ...
                            let w = imgData.width || 100; let h = imgData.height || 100;
                            const aspectRatio = w / h;
                            if (h > maxH) { h = maxH; w = h * aspectRatio; }
                            if (w > maxW) { w = maxW; h = w / aspectRatio; }

                            const imageId = workbook.addImage({ base64: imgData.base64, extension: 'png' });
                            worksheet.addImage(imageId, {
                                tl: { col: colIdx + currentXOffset, row: rowIndex - 1 + 0.1 },
                                ext: { width: w, height: h }
                            });
                            currentXOffset += 0.3; // overlap stack
                        });
                    } else {
                        // Standard Single Image (or just first of array)
                        const imgData = images[0];
                        // ... layout logic for single ...
                        const maxW = 60; const maxH = 60;
                        let w = imgData.width || 100; let h = imgData.height || 100;
                        const aspectRatio = w / h;
                        if (h > maxH) { h = maxH; w = h * aspectRatio; }
                        if (w > maxW) { w = maxW; h = w / aspectRatio; }

                        const imageId = workbook.addImage({ base64: imgData.base64, extension: 'png' });
                        worksheet.addImage(imageId, {
                            tl: { col: colIdx + 0.1, row: rowIndex - 1 + 0.1 },
                            ext: { width: w, height: h }
                        });
                    }
                }
            });
        }

        // Adaptive Row Height
        row.height = hasImage ? 80 : 25;

        // Styling
        row.eachCell((cell) => {
            cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
        });
    }

    // --- Footer / Totals ---
    const totalAmount = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const totalRow = worksheet.addRow(['总计', ...Array(visibleColumns.length - 2).fill(''), totalAmount.toFixed(2)]);
    totalRow.height = 30;
    totalRow.eachCell((cell) => {
        cell.font = { bold: true };
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFF8E1' } // Light yellow
        };
        cell.border = { top: { style: 'double' } };
    });

    // Generate File
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `报销单_${reimbursementInfo.reimburser || '未命名'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
}

/**
 * Export to Print (PDF)
 * @param {Array} items 
 * @param {Array} columns 
 * @param {Object} reimbursementInfo 
 */
/**
 * Export to Print (PDF)
 * Optimized to use IndexedDB and Raw Blobs for speed
 * @param {Array} items 
 * @param {Array} columns 
 * @param {Object} reimbursementInfo 
 */
async function exportToPrint(items, columns, reimbursementInfo) {
    // 1. Open Window Immediately (Bypass Popup Blocker)
    const printWin = window.open('', '_blank');
    if (!printWin) {
        alert('无法启动打印预览，请检查浏览器弹窗设置 (Popup Blocker)');
        return;
    }

    // 2. Show Loading State
    printWin.document.title = "准备打印预览...";
    printWin.document.body.style.backgroundColor = "#1a1a1a";
    printWin.document.body.style.color = "#ffffff";
    printWin.document.body.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;">
            <div style="width:40px;height:40px;border:4px solid #333;border-top-color:#F5D158;border-radius:50%;animation:spin 1s linear infinite;"></div>
            <p style="margin-top:20px;font-size:16px;">正在准备文档，请稍候...</p>
            <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
        </div>
    `;

    try {
        // 3. Process items - Hydrate Blob URLs to real Blobs for IDB
        // This ensures the print window has access to the raw file data
        const processedItems = await Promise.all(items.map(async (item) => {
            const newItem = { ...item };

            const ensureBlob = async (urlProp, fileProp) => {
                const val = newItem[urlProp];

                // Helper to process single URL
                const processUrl = async (u) => {
                    if (u && typeof u === 'string' && u.startsWith('blob:')) {
                        try {
                            const res = await fetch(u);
                            return await res.blob();
                        } catch (e) {
                            console.warn(`Failed to hydrate ${u}`, e);
                            return null;
                        }
                    }
                    // Return original value if it's not a blob URL (e.g. data URL) to avoid clobbering valid data with null
                    return u;
                };

                if (Array.isArray(val)) {
                    // Handle Array
                    newItem[fileProp] = await Promise.all(val.map(processUrl));
                } else {
                    // Handle Single
                    newItem[fileProp] = await processUrl(val);
                }
            };

            await ensureBlob('previewUrl', 'file');
            await ensureBlob('orderImage', 'orderImageFile');
            await ensureBlob('previewUrl', 'file');
            await ensureBlob('orderImage', 'orderImageFile');
            await ensureBlob('paymentProof', 'paymentProofFile');
            await ensureBlob('attachments', 'attachmentsFiles');

            return newItem;
        }));

        const data = {
            items: processedItems, // Use processed items with Blobs
            columns: columns.filter(c => c.visible),
            reimbursementInfo
        };

        // Archive to History (Runs in background, handles its own persistence)
        if (window.storageRepo && window.storageRepo.archiveToHistory) {
            window.storageRepo.archiveToHistory(items, reimbursementInfo).catch(console.error);
        }

        // 4. Save to IndexedDB
        if (window.storageRepo && window.storageRepo.savePrintJob) {
            const jobId = await window.storageRepo.savePrintJob(data);
            printWin.location.href = `print.html?jobId=${jobId}`;
        } else {
            console.warn('StorageRepo missing, trying legacy localStorage');
            localStorage.setItem('printData', JSON.stringify(data));
            printWin.location.href = 'print.html';
        }

    } catch (e) {
        // Handle Error
        printWin.close();
        alert('准备打印数据失败: ' + e.message);
        console.error(e);
    }
}
