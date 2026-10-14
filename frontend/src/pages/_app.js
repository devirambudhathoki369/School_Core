import Head from 'next/head';
import AppContextProvider from '@/contexts/AppContext';
import { ThemeProvider } from "@material-tailwind/react";
import Notification from '@/components/Notification';
import { ConfirmHost } from '@/components/ConfirmDialog';
import '@/styles/globals.css';
import '@/styles/loader.css';
import customTheme from "@/configs/theme";
import { Plus_Jakarta_Sans } from "next/font/google";

// The app's typeface. `next/font` downloads it at BUILD time and serves it from
// our own origin, so a school on a slow line never waits on Google. It is only
// published as a variable here; globals.css decides where it applies (the
// screen, never a printed document).
const appFont = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], display: "swap" });

export const metadata = {
  title: "CentEducation SMSys",
  description: "CentEducation is a school management and analysis system for modern era.",
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
          <title>CentEducation</title>
        </Head>
        {/* on :root, so menus and dialogs drawn outside the page tree get it too */}
        <style jsx global>{`:root { --font-app: ${appFont.style.fontFamily}; }`}</style>
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
