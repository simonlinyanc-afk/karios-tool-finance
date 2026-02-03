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
            if (['preview', 'orderImage', 'paymentProof'].includes(col.id)) {
                let imageUrl = null;
                if (col.id === 'preview') imageUrl = item.previewUrl || item.preview;
                else if (col.id === 'orderImage') imageUrl = item.orderImageUrl || item.orderImage;
                else if (col.id === 'paymentProof') imageUrl = item.paymentProofUrl || item.paymentProof;

                if (imageUrl) {
                    // Count total tasks first
                    totalImages++;
                    imageTasks.push((async () => {
                        try {
                            // OPTIMIZATION: Check if we can skip resize
                            // If item has a flag or if we detect it's already a specific 'compressedBase64'
                            // For now, if it is a data URL, we trust it if generic optimization is not strictly enforced,
                            // BUT standard is 0.6.

                            // User Instruction: "If passed items have compressedBase64, use it"
                            // Use the property directly if available in the item context?
                            // formatting: items[index].compressedBase64 maps to 'preview'?
                            // Let's check item directly from the main array since we have access via closure 'item'

                            let finalBase64 = null;

                            // Check for pre-calculated compressed version (from Dual Stream or History)
                            // We need to know WHICH column this maps the specific image to.
                            // The task says "tell exportManager... if input items have compressedBase64..."
                            // Assuming 'compressedBase64' corresponds to the main 'preview' image.

                            if (col.id === 'preview' && item.compressedBase64) {
                                finalBase64 = item.compressedBase64;
                            }
                            // Check if it's already a data string (History items are Base64)
                            // And if we want to avoid re-compression (Costly!)
                            else if (typeof imageUrl === 'string' && imageUrl.startsWith('data:image')) {
                                // It is likely already compressed from History or Dual Stream
                                finalBase64 = imageUrl;
                            }
                            else {
                                // Ensure resizeImage is available (from finance.js)
                                if (typeof resizeImage !== 'function') {
                                    console.error('resizeImage function not found');
                                    return;
                                }
                                // Use 0.6 quality for Excel optimization
                                finalBase64 = await resizeImage(imageUrl, 0.6);
                            }

                            if (finalBase64) {
                                // Measure image dimensions
                                const dimensions = await new Promise((resolve) => {
                                    const img = new Image();
                                    img.onload = () => resolve({ w: img.width, h: img.height });
                                    img.onerror = () => resolve({ w: 100, h: 100 }); // Default
                                    img.src = finalBase64;
                                    // Safety timeout
                                    setTimeout(() => resolve({ w: 100, h: 100 }), 500);
                                });

                                if (!imageMap[index]) imageMap[index] = {};
                                imageMap[index][col.id] = {
                                    base64: finalBase64,
                                    width: dimensions.w,
                                    height: dimensions.h
                                };
                            }
                        } catch (e) {
                            console.warn('Failed to process image for export', e);
                        } finally {
                            processedImages++;
                            onProgress({
                                processed: processedImages,
                                total: totalImages,
                                message: `正在处理图片 ${processedImages}/${totalImages}`
                            });
                        }
                    })());
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
        const item = items[i];
        const rowValues = visibleColumns.map(col => {
            // Placeholder for image columns
            if (['preview', 'orderImage', 'paymentProof'].includes(col.id)) {
                return '';
            }
            return item[col.id];
        });

        const row = worksheet.addRow(rowValues);
        const rowIndex = row.number;

        // Check for images
        let hasImage = false;
        if (imageMap[i]) {
            visibleColumns.forEach((col, colIdx) => {
                if (imageMap[i][col.id]) {
                    hasImage = true;
                    const imgData = imageMap[i][col.id];

                    // Layout calculation: Scale to fit 60x60 box (safe zone within 80px row)
                    const maxW = 60;
                    const maxH = 60;
                    let w = imgData.width || 100;
                    let h = imgData.height || 100;
                    const aspectRatio = w / h;

                    if (h > maxH) { h = maxH; w = h * aspectRatio; }
                    if (w > maxW) { w = maxW; h = w / aspectRatio; }

                    const imageId = workbook.addImage({
                        base64: imgData.base64,
                        extension: 'png',
                    });

                    worksheet.addImage(imageId, {
                        tl: { col: colIdx + 0.1, row: rowIndex - 1 + 0.1 }, // Centered-ish padding
                        ext: { width: w, height: h }
                    });
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
                const url = newItem[urlProp];
                if (url && typeof url === 'string' && url.startsWith('blob:')) {
                    try {
                        const res = await fetch(url);
                        const blob = await res.blob();
                        newItem[fileProp] = blob;
                    } catch (e) {
                        console.warn(`Failed to hydrate ${urlProp}`, e);
                    }
                }
            };

            await ensureBlob('previewUrl', 'file');
            await ensureBlob('orderImage', 'orderImageFile');
            await ensureBlob('paymentProof', 'paymentProofFile');

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
