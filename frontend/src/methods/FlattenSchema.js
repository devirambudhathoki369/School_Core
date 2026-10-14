/* const testSchema = {
    personal: {
        name: '', email: '', contact: { primary: '', secondary: '' },
        birth_date: { year: '', month: '', date: '' }
    },
    address: { ward: '', city: '', district: '', province: '' },
}; */

function flattenSchema(schema) {
    // console.log(schema);
    let flattened = {};
    for (let [key, value] of Object.entries(schema)) {
        if (value && value.constructor === Object) Object.assign(flattened, flattenSchema(value));
        else flattened[key] = value;
    }
    return flattened;
}

function flattenValidationSchema(validationSchema) {
    let flattened = {};
    for (let [key, value] of Object.entries(validationSchema)) {
        if (value?.constructor?.name === 'Object') {
            Object.assign(flattened, flattenValidationSchema(value));
        } else flattened[key] = value;
    }
    return flattened;
}

function fillData(schema, flattenedSchemaData) {
    const unflattened = {};
    for (let [key, value] of Object.entries(schema)) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            unflattened[key] = fillData(value, flattenedSchemaData);
        } else {
            unflattened[key] = flattenedSchemaData[key];
        }
    }
    return unflattened;
}

function hasDifferences(prevData, currentData) {
    for (let [key, value] of Object.entries(currentData)) {
        if (value !== null && value.constructor === Object) {
            if (hasDifferences(prevData[key], value)) return true;
        } else if (value !== prevData?.[key]) return true;
    }
    return false;
}

function fillDifferences(prevData, currentData) {
    const data = {}
    for (let [key, value] of Object.entries(currentData)) {
        if (value && value.constructor === Object) {
            const diff = fillDifferences(prevData[key], value);
            if (diff) data[key] = diff;
        } else if (value !== prevData?.[key]) {
            data[key] = value;
        }
    }
    return Object.keys(data).length > 0 ? data : null;
}

/* console.log(testSchema);
const x = flattenSchema(testSchema);
console.log(x);
const y = fillData(schema, x);
console.log(y); */

export { flattenSchema, flattenValidationSchema, fillData, hasDifferences, fillDifferences }