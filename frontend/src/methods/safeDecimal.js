export default function safeDecimal(input) {
    return parseFloat(input.toFixed(2));
}