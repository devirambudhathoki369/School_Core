// Central material-tailwind theme. ThemeProvider deep-merges this over the
// library defaults, so we override only what we want and keep everything else.
//
// System-wide button language:
//   • shape  : rounded-lg (already the MT default), normal-case, semibold  ← here
//   • primary: teal filled   → Search / Save / Update (FormSaveButton)
//   • neutral: gray outline   → Reset / Cancel (default outlined Button / ResetButton)
//   • danger : red filled     → Delete (DeleteButton, table delete action)
//
// Setting normal-case + semibold here makes EVERY button (including the ~66
// inline Reset buttons across the app) consistent without touching each file.
const customTheme = {
    button: {
        styles: {
            base: {
                initial: {
                    fontWeight: "font-semibold",
                    // capitalize = first letter of each word uppercased (e.g.
                    // "montessory" → "Montessory", "high school" → "High School").
                    // Data is stored lowercase, so this restores readable casing
                    // without forcing the old ALL-CAPS look.
                    textTransform: "capitalize",
                },
            },
        },
    },
};

export default customTheme;
