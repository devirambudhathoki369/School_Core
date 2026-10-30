import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  const DOMAIN = process.env.NEXT_PUBLIC_DOMAIN;
  return (
    <Html lang="en">
      <Head>
        <>
        </>
        <>
          <link rel="icon" href="/favicon.ico" sizes="any" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />

          {/* The default <title> lives in _app's next/head, NOT here. A title
              rendered by _document is not part of the head manager, so a page
              that sets its own (privacy_policy) could never override it and the
              whole site served one title. */}
          <meta name="title" content="SchoolCore" />
          <meta name="description" content="SchoolCore is a school management and analysis system for modern era." />
          <meta name="keywords" content="schoolcore, centeducation, centit, nirsabi, school, management, analysis, system, software, smsys" />

          <meta property="og:title" content="SchoolCore" />
          <meta property="og:description" content="SchoolCore is a school management and analysis system for the modern era." />
          <meta property="og:image" content={`${DOMAIN}/preview.png`} />
          <meta property="og:url" content={DOMAIN} />
          <meta property="og:type" content="website" />

          <link rel="preconnect" href={process.env.NEXT_PUBLIC_BASE_URL} crossOrigin="anonymous" />
        </>
      </Head>
      <body>
        <Main />
        <NextScript />
        <PreventInputWheel />
      </body>
    </Html>
  );
}

function PreventInputWheel() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
        document.addEventListener('wheel', function(event) {
          const activeElement = document.activeElement;
          if (activeElement.tagName === 'INPUT' && activeElement.type === 'number') {
            activeElement.blur();
          }
        });`
      }}
    />);
}
