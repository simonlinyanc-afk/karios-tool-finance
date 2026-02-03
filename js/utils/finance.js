// Finance and Calculation Utilities
// Responsible for Tax Calculations and Currency Formatting

/**
 * Format currency with robust checks
 */
function formatCurrency(amount) {
    if (amount === undefined || amount === null || isNaN(Number(amount))) return "0.00";
    return Number(amount).toFixed(2);
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

// Global Export
window.formatCurrency = formatCurrency;
window.calculateTax = calculateTax;
