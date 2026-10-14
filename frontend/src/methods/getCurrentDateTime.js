export default function getCurrentDateTime() {
    const generated = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Kathmandu',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    })
        .format(new Date())
        .replace('T', ' ');

    return generated;
}