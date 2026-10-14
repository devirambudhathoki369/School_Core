const extractYear = (str) => {
    const match = str.match(/\d{4}/);  // \d{4} matches exactly four digits
    if (match) {
        return parseInt(match[0], 10);
    } else {
        return "";
    }
};

const getYearFromDate = (date) => {
    const [year, month, day] = date?.split("-");
    return year;
}

export default extractYear;
export { getYearFromDate };