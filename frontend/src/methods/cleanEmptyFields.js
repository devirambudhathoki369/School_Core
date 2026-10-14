/**
 * removes keys from object which has empty value or ''.
 */
export default function cleanEmptyFields(data, exceptions = [], removeZeroes = false) {
    for (let [key, value] of Object.entries(data)) {
        if (value && value.constructor === Object) {
            Object.assign(data[key], cleanEmptyFields(value, exceptions, removeZeroes));
            if (Object.keys(data[key]).length === 0) delete data[key]; // remove {} as well;
        }
        else if (
            (value === null || value === undefined || value === "" || Number.isNaN(value) ||
                (value === 0 && removeZeroes === true)) &&
            !exceptions.includes(key)
        ) {
            delete data[key];
        }
    }
    return data;
}

function handleEmptyValues(data, matcher = '', replacer = null) {
    const newObj = {}
    for (let [key, value] of Object.entries(data)) {
        if (value && value.constructor === Object) {
            newObj[key] = handleEmptyValues(data[key], matcher, replacer);
        } else if (value === matcher) {
            newObj[key] = value || replacer;
        } else {
            newObj[key] = value;
        }
    }
    return newObj;
}

export { handleEmptyValues };