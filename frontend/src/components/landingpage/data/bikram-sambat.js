const NEPAL_OFFSET_MINUTES = 345 // Nepal is UTC+5:45
const DEVANAGARI_DIGITS = "०१२३४५६७८९"

/**
 * The Bikram Sambat year in Nepal at `now`.
 *
 * Whole-number arithmetic only. Baisakh 1 falls on 13 April when the AD year
 * is a leap year and on 14 April otherwise, so the year is the AD year plus 57
 * from that day on and plus 56 before it.
 */
export function bikramSambatYear(now = new Date()) {
    const nepal = new Date(now.getTime() + NEPAL_OFFSET_MINUTES * 60 * 1000)
    const year = nepal.getUTCFullYear()
    const month = nepal.getUTCMonth() + 1
    const day = nepal.getUTCDate()
    const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
    const newYearDay = isLeapYear ? 13 : 14
    const hasTurned = month > 4 || (month === 4 && day >= newYearDay)
    return year + (hasTurned ? 57 : 56)
}

/** 2083 -> "२०८३" */
export function toDevanagariDigits(number) {
    return String(number).replace(/\d/g, (digit) => DEVANAGARI_DIGITS[Number(digit)])
}
