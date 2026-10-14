/**
* this extracts changed data only comparing prevData and newData;
*/
export default function extractDiff(prevData, newData) {
    return Object.entries(newData).reduce((acc, [key, value]) => {
        if (value !== prevData[key]) {
            acc[key] = value;
        }
        return acc;
    }, {});
}