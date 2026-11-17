// Labels and headings are said in sentence case everywhere ("Date of birth (BS)",
// "Guardian details"), as the design system writes them. About half the labels
// in the source were typed in Title Case, and a CSS `capitalize` forced the
// other half into it as well, so every form read as a row of headlines.
//
// Only a word written as a plain capitalised word ("Birth", "Father's") is
// lowered. Acronyms and anything with a capital or a digit inside ("BS", "ID",
// "P.M.", "EMIS", "2083") keep their case, and so do the proper nouns below.
// Anything that is not a string (an element, a number) passes through untouched.

const PROPER = new Set([
    "Nepal", "Nepali", "English", "Bikram", "Sambat", "SchoolCore", "Rs",
    "Google", "Android", "iPhone", "Excel", "Fonepay", "Khalti", "eSewa",
    "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
    "Baisakh", "Baishakh", "Jestha", "Jeth", "Asar", "Ashadh", "Shrawan", "Saun",
    "Bhadra", "Ashwin", "Asoj", "Kartik", "Mangsir", "Poush", "Push", "Magh",
    "Falgun", "Fagun", "Chaitra", "Chait",
]);

const PLAIN_WORD = /^([^A-Za-z]*)([A-Z])([a-z'’]*)([^A-Za-z]*)$/;

export function sentenceCase(text) {
    if (typeof text !== "string" || !text) return text;
    const words = text.split(" ");
    let first = true;
    return words.map((word, n) => {
        if (!word) return word;
        if (first && /[A-Za-z]/.test(word)) {
            first = false;
            const i = word.search(/[A-Za-z]/);
            return word.slice(0, i) + word[i].toUpperCase() + word.slice(i + 1);
        }
        // a new sentence keeps its capital ("...move in. Students who...")
        if (n > 0 && /[.!?]$/.test(words[n - 1]) && words[n - 1].length > 3) return word;
        const m = word.match(PLAIN_WORD);
        if (!m) return word;
        const [, before, initial, rest, after] = m;
        if (PROPER.has(initial + rest) || (initial + rest) === "I") return word;
        return before + initial.toLowerCase() + rest + after;
    }).join(" ");
}

export default sentenceCase;
