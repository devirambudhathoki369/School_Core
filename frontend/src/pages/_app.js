import Head from 'next/head';
import AppContextProvider from '@/contexts/AppContext';
import { ThemeProvider } from "@material-tailwind/react";
import Notification from '@/components/Notification';
import { ConfirmHost } from '@/components/ConfirmDialog';
import '@/styles/globals.css';
import '@/styles/loader.css';
import customTheme from "@/configs/theme";
import { IBM_Plex_Sans, IBM_Plex_Sans_Devanagari } from "next/font/google";

// The app's typeface: IBM Plex Sans, with its Devanagari companion so a Nepali
// name or label is drawn in the same family as the English beside it instead
// of falling through to whatever the system has. `next/font` downloads both at
// BUILD time and serves them from our own origin, so a school on a slow line
// never waits on Google. They are only published as a variable here;
// globals.css decides where it applies (the screen, never a printed document).
const appFont = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap" });
const appFontDevanagari = IBM_Plex_Sans_Devanagari({ subsets: ["devanagari"], weight: ["400", "500", "600", "700"], display: "swap" });

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
        <style jsx global>{`:root { --font-app: ${appFont.style.fontFamily}, ${appFontDevanagari.style.fontFamily}; }`}</style>
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
