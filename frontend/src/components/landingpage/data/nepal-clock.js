const NEPAL_OFFSET_MINUTES = 345 // Nepal is UTC+5:45

/**
 * The clock on the wall in Nepal at `now`, in whole numbers.
 *
 * `weekday` counts from Sunday (0) to Saturday (6); `minutes` is the minute of
 * the day, 0 to 1439.
 */
export function nepalClock(now = new Date()) {
    const nepal = new Date(now.getTime() + NEPAL_OFFSET_MINUTES * 60 * 1000)
    const hour = nepal.getUTCHours()
    const minute = nepal.getUTCMinutes()
    const hour12 = hour % 12 === 0 ? 12 : hour % 12
    return {
        weekday: nepal.getUTCDay(),
        minutes: hour * 60 + minute,
        label: `${hour12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`,
    }
}

export const SATURDAY = 6
