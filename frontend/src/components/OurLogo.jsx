// The SchoolCore mark: a core inside a rounded square. Drawn inline rather than
// shipped as an image so it takes the palette it sits on and stays sharp at
// every size from the 16px tab icon up.
//
//   tone="brand" (default) — the active palette's accent with a white core,
//                            for white surfaces: the top bar, the sign-in sheet.
//   tone="rail"            — the rail's own mark colour, so it stays visible on
//                            a dark rail where the accent would sink into it.
function OurLogo({ size = 40, tone = "brand" }) {
    const fill = tone === "rail" ? "var(--t-rail-mark, #3B5BDB)" : "var(--t-brand-solid, #3B5BDB)";
    const ink = tone === "rail" ? "var(--t-rail-mark-ink, #FFFFFF)" : "#FFFFFF";
    return (
        <svg width={size} height={size} viewBox="0 0 28 28" role="img" aria-label="SchoolCore"
            className="shrink-0" style={{ flex: "0 0 auto" }}>
            <rect width="28" height="28" rx="8" fill={fill} />
            <circle cx="14" cy="14" r="6.5" fill="none" stroke={ink} strokeWidth="2.5" />
            <circle cx="14" cy="14" r="2.25" fill={ink} />
        </svg>
    )
}

export default OurLogo;
