import { Anek_Devanagari, Atkinson_Hyperlegible, Bricolage_Grotesque, IBM_Plex_Mono } from "next/font/google"

// The website's own faces, fetched at BUILD time and served from our origin.
// The body is the app's typeface, which `_app` already loads for every page.

// Headings. Weight is the only axis asked for: with its width and optical-size
// axes the file is 131 KB, without them 41 KB, and the headings set their own
// spacing anyway.
const displayFont = Bricolage_Grotesque({
    subsets: ["latin"],
    display: "swap",
    variable: "--lp-font-display",
})

// Labels, times and figures.
const monoFont = IBM_Plex_Mono({
    subsets: ["latin"],
    weight: "500",
    display: "swap",
    variable: "--lp-font-mono",
})

// The Bikram Sambat year and the Nepali months, far down the page: not preloaded.
const devanagariFont = Anek_Devanagari({
    subsets: ["devanagari"],
    weight: "700",
    display: "swap",
    preload: false,
    variable: "--lp-font-deva",
})

// "Readable font" in the accessibility panel. Fetched only by a visitor who
// turns it on.
const plainFont = Atkinson_Hyperlegible({
    subsets: ["latin"],
    weight: ["400", "700"],
    display: "swap",
    preload: false,
    variable: "--lp-font-plain",
})

export const fontVariables = [displayFont, monoFont, devanagariFont, plainFont].map((font) => font.variable).join(" ")
