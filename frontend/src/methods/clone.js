export default function clone(data) {
    const cloned = {}
    for (let [key, value] of Object.entries(data)) {
        if (value && value.constructor === Object) {
            cloned[key] = clone(data[key]);
        } else {
            cloned[key] = value;
        }
    }
    return cloned;
}