import { nepaliMonths } from "./constants"

const parseNepaliDate = (dateStr) => {
    const [year, month, day] = dateStr.split("-").map(Number);
    return { year, month, day };
}

const isWithinNepaliRange = (date, startDate, endDate) => {
    const d = parseNepaliDate(date);
    const start = parseNepaliDate(startDate);
    const end = parseNepaliDate(endDate);

    // Simple comparison - this would need to be more sophisticated in a real app
    if (d.year !== start.year || d.year !== end.year) return false;

    // Check if date is between start and end months
    if (d.month < start.month || d.month > end.month) return false;

    // If same month as start, check day
    if (d.month === start.month && d.day < start.day) return false;

    // If same month as end, check day
    if (d.month === end.month && d.day > end.day) return false;

    return true;
}


const formatNepaliDate = (dateStr) => {
    if (!dateStr) return "";
    const { year, month, day } = parseNepaliDate(dateStr);
    return `${nepaliMonths[month - 1]} ${day}, ${year}`;
}

export { parseNepaliDate, formatNepaliDate, isWithinNepaliRange };