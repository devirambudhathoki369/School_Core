/**
 * The band at the top of a screen: what am I looking at, and what can I do here.
 *
 * Several pages grew their own version of this inline (Library ▸ Books had one
 * with its own gradient), and most pages had none at all — they opened straight
 * onto a filter row, so the first thing you read was "Role" with no idea what
 * the page was. One primitive means a page announces itself the same way
 * everywhere, and a theme repaints all of them at once.
 *
 * Structure lives here and is the same on every theme; only the surface is
 * repainted (globals.css, `.app-pagehead`): a theme lays its accent down as one
 * flat band, Classic is a white card with the accent on the icon. No gradient
 * on either — the teal→sky→blue sweep this used to carry was exactly the
 * "generated" look the product is moving away from.
 */
function PageHeader({ icon: Icon, title, subtitle, meta, actions, children }) {
    return (
        <div className="app-pagehead hide-from-print mb-3 rounded-xl border border-[var(--line)] bg-white
            px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

            <div className="flex items-center gap-3 min-w-0">
                {Icon && (
                    <span className="app-pagehead-icon shrink-0 grid place-items-center h-10 w-10
                        rounded-lg bg-[var(--t-brand-tint)] text-[var(--t-brand-ink)]">
                        <Icon className="h-6 w-6" />
                    </span>
                )}
                <div className="min-w-0">
                    <h2 className="app-pagehead-title text-[1.05rem] font-semibold leading-tight text-[var(--ink-900)] truncate">
                        {title}
                    </h2>
                    {subtitle && (
                        <p className="app-pagehead-sub text-[0.78rem] leading-5 text-[var(--ink-500)] truncate">{subtitle}</p>
                    )}
                </div>
            </div>

            {(meta?.length || actions || children) && (
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {meta?.map((m, i) => (
                        <span key={i} className="app-pagehead-meta inline-flex items-baseline gap-1.5
                            rounded-lg bg-[var(--surface-soft)] border border-[var(--line)] px-2.5 py-1.5">
                            <b className="text-sm font-bold tabular-nums text-[var(--ink-900)]">{m.value}</b>
                            <span className="text-[0.72rem] text-[var(--ink-500)]">{m.label}</span>
                        </span>
                    ))}
                    {actions}
                    {children}
                </div>
            )}
        </div>
    );
}

export default PageHeader;
