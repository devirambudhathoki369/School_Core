// Served directly by the middleware (see middleware.js) when the `maintenance`
// flag is on. Inlined rather than rewritten to a file under public/: rewriting
// made Next resolve nextUrl (https + localhost:3000 behind nginx/Cloudflare) as
// an *external* URL and proxy it back into its own plain HTTP port — TLS onto a
// non-TLS socket, EPROTO, 500 on every page.
export const MAINTENANCE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Site Maintenance - SchoolCore</title>
<style>
    body {
        font: 20px Helvetica, sans-serif;
        color: #333;
        text-align: center;
        padding: 12vh 20px;
    }

    h1 {
        font-size: 50px;
    }

    article {
        display: block;
        text-align: left;
        max-width: 650px;
        margin: 0 auto;
    }

    @media (max-width: 480px) {
        h1 {
            font-size: 32px;
        }
    }
</style>
</head>
<body>
<article>
    <h1>We&rsquo;ll be back soon!</h1>
    <div>
        <p>Sorry for the inconvenience but we&rsquo;re performing some maintenance at the moment. We&rsquo;ll be back
            online shortly!</p>
        <p>&mdash; SchoolCore</p>
    </div>
</article>
</body>
</html>`;
