function customParseFloat(number) {
    if (number) {
        return Math.abs(number).toFixed(2);
    }
}

// The balance sheet's profit/loss row, and only that row.
//
// Every other figure on the sheet is printed as a magnitude: the stored totals
// are debit-positive (assets +, liabilities and equity -) and customParseFloat
// drops the sign because the COLUMN already says which side it is on. The
// year's result is the one row where the sign is the meaning -- a profit adds
// to equity, a loss eats into it -- and Math.abs() would print the two
// identically. So it is flipped into reading order (profit +, loss -) and kept
// signed. `-0` is normalised away so a break-even year prints "0.00".
function equitySideParseFloat(number) {
    const value = parseFloat(number);
    if (Number.isNaN(value)) return "";
    return (-value || 0).toFixed(2);
}

export { customParseFloat, equitySideParseFloat };
