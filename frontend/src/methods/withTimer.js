/**
 * this calculates the time taken by a function \
 * `withTimer(function_name)(arguments);`
 */
export default function withTimer(_function) {
    return function (...args) {
        // this function calculates and prints time taken;
        const startTime = performance.now();
        const result = _function.apply(this, args);
        const endTime = performance.now();
        console.log(`Time taken by "${_function.name}" : ${(endTime - startTime).toFixed(2)} ms`);
        return result;
    }
}