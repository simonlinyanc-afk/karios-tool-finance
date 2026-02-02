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
                            // Ensure resizeImage is available (from finance.js)
                            if (typeof resizeImage !== 'function') {
                                console.error('resizeImage function not found');
                                return;
                            }

                            // Use 0.6 quality for Excel optimization
                            const base64 = await resizeImage(imageUrl, 0.6);
                            if (base64) {
                                // Measure image dimensions
                                const dimensions = await new Promise((resolve) => {
                                    const img = new Image();
                                    img.onload = () => resolve({ w: img.width, h: img.height });
                                    img.onerror = () => resolve({ w: 100, h: 100 }); // Default
                                    img.src = base64;
                                    // Safety timeout
                                    setTimeout(() => resolve({ w: 100, h: 100 }), 500);
                                });

                                if (!imageMap[index]) imageMap[index] = {};
                                imageMap[index][col.id] = {
                                    base64,
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
async function exportToPrint(items, columns, reimbursementInfo) {
    try {
        // 1. Process items to convert Blob URLs to Base64
        // Logic similar to archiveToHistory
        const processedItems = await Promise.all(items.map(async (item) => {
            const newItem = { ...item };

            // Image fields to check
            const imageFields = ['previewUrl', 'orderImage', 'paymentProof', 'preview', 'orderImageUrl', 'paymentProofUrl'];

            for (const field of imageFields) {
                const val = newItem[field];
                if (val && typeof val === 'string' && val.startsWith('blob:')) {
                    // Check if resizeImage is available (global from finance.js)
                    if (typeof resizeImage === 'function') {
                        // Use resizeImage (default quality 0.85) to get Base64
                        // This solves the Cross-Origin / Blob URL issue for the new window
                        newItem[field] = await resizeImage(val);
                    } else {
                        console.warn('resizeImage not found, image might not print:', val);
                    }
                }
            }
            return newItem;
        }));

        const data = {
            items: processedItems, // Use processed items with Base64 images
            columns: columns.filter(c => c.visible),
            reimbursementInfo
        };

        // Archive to History (Fire and forget - usage original items)
        if (window.storageRepo && window.storageRepo.archiveToHistory) {
            window.storageRepo.archiveToHistory(items, reimbursementInfo);
        }

        localStorage.setItem('printData', JSON.stringify(data));

        const printWin = window.open('print.html', '_blank');
        if (!printWin) {
            alert('无法启动打印预览，请检查浏览器弹窗设置');
        }
    } catch (e) {
        alert('准备打印数据失败: ' + e.message);
        console.error(e);
    }
}
