import Head from 'next/head';
import AppContextProvider from '@/contexts/AppContext';
import { ThemeProvider } from "@material-tailwind/react";
import Notification from '@/components/Notification';
import { ConfirmHost } from '@/components/ConfirmDialog';
import '@/styles/globals.css';
import '@/styles/loader.css';
import customTheme from "@/configs/theme";
import { Bricolage_Grotesque, Hanken_Grotesk, JetBrains_Mono, Mukta } from "next/font/google";

// The app's type, in three voices:
//   • Hanken Grotesk for everything people read and type,
//   • Bricolage Grotesque for page titles and the big figures,
//   • JetBrains Mono for numbers people copy (receipt and student numbers).
// Mukta follows each of them for Devanagari, so a Nepali name is drawn in a
// matching hand instead of whatever the system has. `next/font` downloads them
// at BUILD time and serves them from our own origin, so a school on a slow
// line never waits on Google. They are only published as variables here;
// globals.css decides where each applies (the screen, never a printed document).
const appFont = Hanken_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], display: "swap" });
const displayFont = Bricolage_Grotesque({ subsets: ["latin"], weight: ["500", "600", "700", "800"], display: "swap" });
const monoFont = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "600"], display: "swap" });
const appFontDevanagari = Mukta({ subsets: ["devanagari"], weight: ["400", "500", "600", "700", "800"], display: "swap" });

export const metadata = {
  title: "SchoolCore",
  description: "SchoolCore runs a school's attendance, fees, exams, payroll, library, hostel and canteen in one place.",
}

export default function App({ Component, pageProps }) {
  return (
    <AppContextProvider>
      <ThemeProvider value={customTheme}>
        {/* The site-wide default. It sits here rather than in _document so the
            head manager owns it and a page CAN override it — one rendered by
            _document is outside that manager, so every page served the same
            title however hard it tried to set its own. */}
        <Head>
          <title>SchoolCore</title>
        </Head>
        {/* on :root, so menus and dialogs drawn outside the page tree get it too */}
        <style jsx global>{`:root {
          --font-app: ${appFont.style.fontFamily}, ${appFontDevanagari.style.fontFamily};
          --font-display: ${displayFont.style.fontFamily}, ${appFontDevanagari.style.fontFamily};
          --font-mono: ${monoFont.style.fontFamily}, ui-monospace, monospace;
        }`}</style>
        <Component {...pageProps} />
        <Notification />
        {/* Renders nothing until a destructive action asks for confirmation.
            Every school gets it now, on every palette — a delete is not a
            matter of appearance. */}
        <ConfirmHost />
      </ThemeProvider>
    </AppContextProvider>
  )
}
