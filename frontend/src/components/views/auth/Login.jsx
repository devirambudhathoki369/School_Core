import { useCallback, useEffect, useRef, useState } from "react";
import { PasswordInput, TextInput } from "@/components/inputs";
import { useAppContext } from "@/contexts/AppContext";
import loginSchema from "@/schemas/validations/login";
import { login } from "@/services/functions/auth/login";
import OurLogo from "@/components/OurLogo";
import {
    CheckCircleIcon, SparklesIcon, CheckBadgeIcon,
    ExclamationTriangleIcon, ExclamationCircleIcon, LockClosedIcon,
    BuildingLibraryIcon, UserGroupIcon, AcademicCapIcon, ShieldCheckIcon,
    CalendarDaysIcon, ChatBubbleLeftRightIcon,
} from "@heroicons/react/24/outline";
import { useRouter } from "next/router";

const formState = { username: '', password: '' }; // DON'T DELETE THIS;

// What the person signing in is being told they are signing in AS. The portal
// is one form on four addresses (`/admin`, `/staff`, `/student`, `/superadmin`)
// and the only thing that distinguished them was the word dropped into "Hello
// {role}" — including the literal string "superadmin", which is a database
// value, not a greeting.
const ROLE_COPY = {
    admin: "School administration",
    staff: "Staff portal",
    student: "Student & parent portal",
    superadmin: "Operator console",
};

// The mark beside the name of the portal: which door this is, at a glance.
const ROLE_ICON = {
    admin: BuildingLibraryIcon,
    staff: UserGroupIcon,
    student: AcademicCapIcon,
    superadmin: ShieldCheckIcon,
};

// What the product covers, in the words of its own summary line.
const COVERS = ["Fees and accounting", "Examinations", "Attendance", "Transport", "Staff and payroll"];

/**
 * The product, drawn rather than described.
 *
 * The wall used to be a headline over a column of ticked sentences — the page
 * a person meets first was the plainest one in the product. This is the
 * dashboard they are about to open, rising from the foot of the wall like a
 * screen: the four summary tiles, today's attendance as rings, a column a
 * month for collections, then the gender split and the busiest stations. It is
 * a drawing, not data — bars and lines where the figures go, so nothing here
 * can be mistaken for a school's numbers — and it is hidden from assistive
 * technology for the same reason.
 *
 * It is as wide as the wall and as tall as the wall has room for: on a short
 * window the foot of the drawing runs off the foot of the wall (see
 * `.pub-window`). It used to be 40rem wide and to vanish outright under 760px
 * of height, which on a wide laptop at 125% scaling left a headline in one
 * corner of an empty field.
 */
function ProductWindow() {
    // label, mark, the tile's role colour (the dashboard's own --k1..4), its
    // tint, its soft bar, then the two bar lengths
    const tiles = [
        ["Total students", AcademicCapIcon, "#0d9488", "#e3f3f1", "#bfe3de", 54, 72],
        ["Total staff", UserGroupIcon, "#0284c7", "#e0f0fa", "#cfe4f5", 32, 80],
        ["Economic year", CalendarDaysIcon, "#059669", "#dff3ea", "#c5e8d8", 78, 58],
        ["SMS credits", ChatBubbleLeftRightIcon, "#b45309", "#fbefdc", "#f3dfbd", 46, 66],
    ];
    // a year of months: eight collected, the eighth in progress, four to come
    const columns = [36, 58, 46, 74, 54, 82, 64, 94, 0, 0, 0, 0];
    const stations = [[5.5, 90, "#0d9488"], [4.25, 68, "#5fb8ae"], [5, 49, "#8fcec6"], [3.5, 31, "#bfe3de"]];
    const ring = (colour, track, dash) => (
        <svg viewBox="0 0 50 50" className="pub-window-ring -rotate-90 shrink-0">
            <circle cx="25" cy="25" r="20" fill="none" strokeWidth="6" stroke={track} />
            <circle cx="25" cy="25" r="20" fill="none" strokeWidth="6" stroke={colour} strokeLinecap="round" strokeDasharray={`${dash} 126`} />
        </svg>
    );
    return (
        <div className="pub-window" aria-hidden="true">
            <div className="pub-window-tiles">
                {tiles.map(([label, Mark, ink, tint, soft, figure, sub]) => (
                    <div key={label} className="pub-window-tile">
                        <span className="pub-window-chip" style={{ background: tint, color: ink }}><Mark /></span>
                        <div className="flex min-w-0 flex-1 flex-col gap-y-1.5">
                            <span className="pub-window-label">{label}</span>
                            <span className="pub-window-bar h-3 bg-[#cbd5e1]" style={{ width: `${figure}%` }}></span>
                            <span className="pub-window-bar h-1.5" style={{ width: `${sub}%`, background: soft }}></span>
                        </div>
                    </div>
                ))}
            </div>
            <div className="pub-window-row">
                <div className="pub-window-cell">
                    <span className="pub-window-label">Today&apos;s attendance</span>
                    {[["#0d9488", "#d6eeea", 108, 62, 84], ["#2a78d6", "#dbe8fa", 116, 44, 70]].map(([colour, track, dash, first, second]) => (
                        <div key={colour} className="flex items-center gap-x-3.5">
                            {ring(colour, track, dash)}
                            <div className="flex min-w-0 flex-1 flex-col gap-y-2">
                                <span className="pub-window-bar h-[11px] bg-[#cbd5e1]" style={{ width: `${first}%` }}></span>
                                <span className="pub-window-bar h-[7px] bg-[#e2e8f0]" style={{ width: `${second}%` }}></span>
                            </div>
                            <span className="pub-window-bar h-[22px] w-12 shrink-0 bg-[#eef2f6]"></span>
                        </div>
                    ))}
                </div>
                <div className="pub-window-cell">
                    <span className="pub-window-label">Fee collections</span>
                    <div className="flex items-center gap-x-3.5">
                        <span className="pub-window-bar h-[13px] w-[8.5rem] bg-[#cbd5e1]"></span>
                        <span className="pub-window-bar h-2 w-[4.75rem] bg-[#e2e8f0]"></span>
                    </div>
                    <div className="pub-window-columns">
                        {columns.map((height, i) => (
                            <span key={i} className="flex-1 rounded-t-[5px]"
                                style={height
                                    ? { height: `${height}%`, background: i === 7 ? "#0d9488" : "#bfe3de" }
                                    : { height: 4, background: "#e2e8f0" }}></span>
                        ))}
                    </div>
                </div>
            </div>
            <div className="pub-window-row pb-5">
                <div className="pub-window-cell">
                    <span className="pub-window-label">Running students · by gender</span>
                    <div className="flex h-3 gap-x-[3px]">
                        <span className="rounded-l-full bg-[#0d9488]" style={{ flex: 52 }}></span>
                        <span className="bg-[#2a78d6]" style={{ flex: 45 }}></span>
                        <span className="rounded-r-full bg-[#94a3b8]" style={{ flex: 3 }}></span>
                    </div>
                    {[["#0d9488", 3, 2.25], ["#2a78d6", 3.75, 2.25], ["#94a3b8", 2.75, 1.5]].map(([colour, name, count]) => (
                        <div key={colour} className="flex items-center gap-x-2.5">
                            <span className="h-[9px] w-[9px] shrink-0 rounded-[3px]" style={{ background: colour }}></span>
                            <span className="pub-window-bar h-2 bg-[#cbd5e1]" style={{ width: `${name}rem` }}></span>
                            <span className="pub-window-bar ml-auto h-2 bg-[#e2e8f0]" style={{ width: `${count}rem` }}></span>
                        </div>
                    ))}
                </div>
                <div className="pub-window-cell">
                    <span className="pub-window-label">Busiest stations</span>
                    {stations.map(([name, share, colour]) => (
                        <div key={share} className="flex items-center gap-x-3">
                            <span className="w-[5.5rem] shrink-0">
                                <span className="pub-window-bar h-2 bg-[#cbd5e1]" style={{ width: `${name}rem` }}></span>
                            </span>
                            <span className="flex h-2.5 flex-1 rounded-full bg-[#eef2f6]">
                                <span className="rounded-full" style={{ width: `${share}%`, background: colour }}></span>
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// The same idea at a phone's width: three small tiles under the sign-in sheet.
function Glance() {
    return (
        <div className="pub-glance" aria-hidden="true">
            <div className="pub-glance-cell">
                <span className="pub-glance-label">Attendance</span>
                <svg width="40" height="40" viewBox="0 0 50 50" className="-rotate-90">
                    <circle cx="25" cy="25" r="20" fill="none" strokeWidth="7" stroke="#d6eeea" />
                    <circle cx="25" cy="25" r="20" fill="none" strokeWidth="7" stroke="#0d9488" strokeLinecap="round" strokeDasharray="108 126" />
                </svg>
            </div>
            <div className="pub-glance-cell">
                <span className="pub-glance-label">Fees</span>
                <div className="flex h-10 items-end gap-x-1 border-b border-[#e2e8f0]">
                    {[40, 66, 52, 90].map((height, i) => (
                        <span key={i} className="flex-1 rounded-t-[3px]" style={{ height: `${height}%`, background: i === 3 ? "#0d9488" : "#bfe3de" }}></span>
                    ))}
                </div>
            </div>
            <div className="pub-glance-cell">
                <span className="pub-glance-label">Results</span>
                <div className="flex h-10 flex-col justify-center gap-y-1.5">
                    <span className="pub-glance-line w-[90%] !bg-[#cbd5e1]"></span>
                    <span className="pub-glance-line w-[64%]"></span>
                    <span className="pub-glance-line w-[78%]"></span>
                </div>
            </div>
        </div>
    );
}

function Login({ role }) {
    const { user: { setUser },
        notification: { updateNotification } } = useAppContext();
    const router = useRouter();
    const [status, setStatus] = useState(false);
    const [form, setForm] = useState({ ...formState });
    /**
     * Why a field is being rejected, ON the field.
     *
     * `loginSchema.validate` was called with yup's default `abortEarly`, so it
     * threw on the FIRST failure and the message went to the app's transient
     * notification — which then faded. Someone who typed a four-character
     * username got a toast reading "Username must be between 6 and 25
     * characters", with nothing on screen tying that to a field and nothing
     * left at all once it dismissed. Collected per-path now and rendered by the
     * input's own `Error`, which is already wired to `aria-describedby`.
     */
    const [errors, setErrors] = useState({});
    /**
     * Why the SERVER refused, kept on screen.
     *
     * Same defect one layer down: a wrong password produced a notification and
     * no other trace, so the form looked like it had simply done nothing. This
     * survives until the next attempt.
     */
    const [refusal, setRefusal] = useState('');

    function handleChange(e) {
        const { name, value } = e;
        setForm(state => ({ ...state, [name]: value }));
        // Clearing as they type: a message about what they typed a moment ago
        // is noise once they are fixing it.
        setErrors(state => (state[name] ? { ...state, [name]: undefined } : state));
    }

    async function handleLogin(e) {
        e.preventDefault();
        if (role === null || status) return;
        setRefusal('');
        setErrors({});
        // `abortEarly: false` so BOTH fields can report at once — the previous
        // behaviour made a form with two mistakes take two round trips.
        try {
            await loginSchema.validate(form, { abortEarly: false });
        } catch (err) {
            const collected = {};
            for (const item of (err?.inner?.length ? err.inner : [err])) {
                if (item?.path && !collected[item.path]) collected[item.path] = item.message;
            }
            setErrors(collected);
            // Announced as well as shown: the notification is what a user who
            // has scrolled the form out of view will notice.
            updateNotification('', err?.errors?.[0] || err?.message);
            return;
        }
        setStatus(true);
        try {
            const [code, message, data] = await login(role, form);
            updateNotification(code, message);
            if (code === 200) {
                if (data?.user && data?.user?.username) {
                    // A session always opens on the dashboard. The portal keeps
                    // the open page in the fragment, so arriving on a bookmarked
                    // (or just-signed-out-of) `/admin#accounting.entry` would
                    // otherwise drop the user straight into that screen the
                    // moment they signed in. Clearing it through the router —
                    // not history.replaceState — is what matters: the view is
                    // resolved from `router.asPath`, which a raw history write
                    // would leave stale.
                    if (window.location.hash) {
                        await router.replace(window.location.pathname, undefined, { shallow: true });
                    }
                    setUser(data?.user || {});
                    // Deliberately NOT clearing `status` on the success path:
                    // the view is about to be swapped for the portal, and
                    // re-enabling the button first lets an impatient second
                    // click fire a second sign-in.
                    return;
                }
            }
            setRefusal(message || "We couldn't sign you in. Please check your details and try again.");
        } catch ({ message }) {
            updateNotification('', message);
            setRefusal(message || "We couldn't reach the server. Please check your connection and try again.");
        }
        setStatus(false);
    }

    /**
     * Why the user is looking at a sign-in form.
     *
     * A session that ends mid-work — an expired token, a revoked one, a request
     * refused for the wrong school — used to dump the user back here with no
     * explanation at all, which reads as the app having lost their work. The
     * axios interceptor leaves the server's own sentence behind before it
     * reloads; it is read once and cleared, so it never reappears on the next
     * visit to this screen.
     */
    const [endedReason, setEndedReason] = useState('');
    useEffect(() => {
        try {
            const reason = sessionStorage.getItem('session-ended');
            if (reason) {
                setEndedReason(reason);
                sessionStorage.removeItem('session-ended');
            }
        } catch (_) { /* storage unavailable — the form still works */ }
    }, []);

    /**
     * Caps Lock.
     *
     * The single most common reason a password that the user is certain about
     * is refused, and the one thing the browser will not tell them. Read off
     * the keyboard event's own modifier state, so it costs no listener of its
     * own and reports correctly however the key was set.
     */
    const [capsOn, setCapsOn] = useState(false);
    const readCaps = useCallback((e) => {
        if (typeof e?.getModifierState !== 'function') return;
        setCapsOn(e.getModifierState('CapsLock'));
    }, []);

    /**
     * The username field takes focus when the page opens — with a mouse or a
     * trackpad, where the next thing anyone does is type. It asked for this
     * all along (`autoFocus: true` below), but the shared text input never
     * passes that on, so nothing was focused. Not on a touch screen: there,
     * focusing a field throws the keyboard up over a page nobody has read yet.
     */
    const formRef = useRef(null);
    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia?.('(pointer: fine)').matches) return;
        formRef.current?.querySelector('input[name="username"]')?.focus();
    }, []);

    //
    const [tab, setTab] = useState('features');
    const [features, setFeatures] = useState({ all_features: [], recent_features: [] });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let live = true;
        (async () => {
            // Every failure path ends with the wall showing SOMETHING. The
            // previous version awaited `res.json()` unguarded, so an offline
            // browser or a 500 from the route threw before `setLoading(false)`
            // and left the skeleton up for the life of the page.
            try {
                const res = await fetch("/api/features");
                if (!res?.ok) throw new Error(`features: ${res?.status}`);
                const body = await res.json();
                if (!live) return;
                setFeatures({
                    all_features: body?.all_features || [],
                    recent_features: body?.recent_features || [],
                });
            } catch (_) {
                // Nothing to say about the product is not an error worth
                // showing anyone who came here to sign in — the wall simply
                // falls back to the lockup and the form is untouched.
                if (live) setFeatures({ all_features: [], recent_features: [] });
            } finally {
                if (live) setLoading(false);
            }
        })();
        return () => { live = false; };
    }, []);

    // The wall is marketing, not a spec sheet. The API returns fifteen
    // capabilities, and rendering all of them produced a column of ticks that
    // read as a wall of text and buried the form beside it. Six says what the
    // product is; the rest are discoverable once you are inside.
    const list = (tab === 'whatsnew'
        ? (features.recent_features || [])
        : (features.all_features || []).slice(0, 6));
    const hasNews = (features.recent_features || []).length > 0;

    return (
        // TWO ZONES: somewhere for the product to speak, somewhere quiet to
        // type. The first cut painted the brand ground across the WHOLE
        // viewport and floated the form on it as a card — which on a wide
        // screen left a 416px box marooned in an empty teal field with ~400px
        // of dead ground above and below it. The panel is the left half only;
        // the form half is plain white, which is the surface a form belongs on.
        //
        // The split is `lg` — 960px under `withMT()` — not `md`, which is 720px
        // here. At 720 the wall and the form each got ~355px and both were
        // crushed; a tablet in portrait gets the single-column layout instead.
        //
        // `100dvh`, not `100vh`: on a phone `vh` is the height the page would
        // have with the address bar scrolled away, so centring inside it pushes
        // the form down by the difference and leaves a dead band above it.
        <div className="grid min-h-[100dvh] grid-cols-1 grid-rows-[auto_1fr] bg-white pub-split lg:grid-rows-1">
            {/* ---- the brand header, single-column widths only ----
                Below `lg` the wall is hidden and the form IS the page. Left as
                plain white that read as a bare form on an empty sheet — the
                product never introduced itself at all on the device most
                parents actually sign in from. This is the wall compressed to a
                band: same ground, same lockup, none of the marketing. */}
            <header className="pub-panel pub-wall pub-band px-5 pb-24 pt-7 sm:px-10 lg:hidden">
                <div className="flex items-center gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/95 p-1.5 shadow-sm">
                        <OurLogo size={32} />
                    </span>
                    <div className="leading-tight">
                        <p className="text-[1.15rem] font-bold tracking-tight">CentEducation</p>
                        <p className="pub-eyebrow" style={{ color: 'var(--pub-ink-dim)' }}>
                            by Cent IT Solutions
                        </p>
                    </div>
                </div>
                {/* one line of what the product is; the sign-in sheet below
                    rises over the foot of this band */}
                <p className="mt-4 max-w-sm text-[1.55rem] font-extrabold leading-[1.15] tracking-tight [text-wrap:balance]">
                    Everything your school runs on, in one place.
                </p>
            </header>

            {/* ---- the wall ----
                Anchored top and bottom rather than centred as one floating
                block: a lockup on the top edge and the product rising from the
                foot give the panel a structure, where a single centred stack
                just hovered in the middle of the colour.

                Sized by the SCREEN, not for one screen. It was a 36rem column
                of words and a 40rem drawing pinned to one corner — right at
                1280, and on a wide monitor most of the wall was bare ground.
                The headline now grows with the width, the drawing is as wide
                as the wall, and what is spare goes either side of the words
                (`.pub-wall-say`). Past 72rem the column stops and centres. */}
            <aside className="pub-panel pub-wall pub-wall-desk hidden lg:flex lg:h-[100dvh]">
                <div className="pub-wall-col">
                    <div className="flex shrink-0 items-center gap-3">
                        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/95 p-1.5 shadow-sm 2xl:h-[3.25rem] 2xl:w-[3.25rem]">
                            <OurLogo size={36} />
                        </span>
                        <div>
                            <p className="text-[1.3rem] font-bold leading-[1.2] tracking-tight 2xl:text-[1.4rem]">CentEducation</p>
                            <p className="pub-eyebrow mt-0.5" style={{ color: 'var(--pub-ink-soft)' }}>
                                by Cent IT Solutions
                            </p>
                        </div>
                    </div>

                    <div className="pub-wall-say">
                        <div>
                            <h1 className="pub-wall-title">
                                Everything your school runs on, in one place.
                            </h1>
                            <p className="pub-wall-lede">
                                Admissions and fees, accounting, examinations, attendance and
                                communication — one system, one record for every student.
                            </p>
                        </div>

                        {/* What it covers, as a row of names rather than a column of
                            sentences — and, when the product has news, the one tab that
                            opens it. The six-line capability list this replaces said
                            the same thing at three times the height. */}
                        <div>
                            <ul className="pub-covers">
                                {COVERS.map((item) => <li key={item}>{item}</li>)}
                                {hasNews &&
                                    <li className="!border-0 !p-0">
                                        <button type="button" className="pub-covers-news" aria-expanded={tab === 'whatsnew'}
                                            onClick={() => setTab(tab === 'whatsnew' ? 'features' : 'whatsnew')}>
                                            <SparklesIcon aria-hidden="true" /> What&rsquo;s new
                                        </button>
                                    </li>}
                            </ul>
                            {hasNews && tab === 'whatsnew' &&
                                <ul className="mt-4 max-w-lg space-y-2">
                                    {list.slice(0, 4).map((item, index) => (
                                        <li key={index} className="pub-feature">
                                            <CheckBadgeIcon aria-hidden="true" />
                                            <span>{item}</span>
                                        </li>
                                    ))}
                                </ul>}
                        </div>
                    </div>

                    <ProductWindow />
                </div>
            </aside>

            {/* ---- the form ----
                Plain white at every width. A form is a document you fill in, so
                it belongs on paper-white rather than on the artwork. */}
            {/* Anchored near the TOP below `lg`, centred only when the wall is
                beside it. Dead-centring under the brand header left ~200px of
                blank sheet between the two and pushed the fields toward the
                fold; a form the user came here to type in should meet the eye
                where the header leaves off.

                Beside the wall the sheet is centred by its own `auto` margins
                and the footnote rests on the floor of the column, the way the
                wall is anchored top and foot. (Auto margins rather than
                `justify-center`: on a window too short for the sheet they fall
                to zero and the column scrolls from its top, where centring
                would have cut the top of the sheet off.) */}
            <div className="pub-signin flex flex-col justify-start px-4 pb-10 sm:px-10 lg:h-[100dvh] lg:overflow-y-auto lg:px-12 lg:pb-8 lg:pt-10">
                {/* The sheet. Below `lg` it rises over the foot of the brand
                    band, so the band and the form read as one page rather than
                    a banner with a form under it. */}
                <div className="pub-signin-card relative z-[1] mx-auto -mt-[4.5rem] w-full max-w-[26rem] lg:my-auto 2xl:max-w-[27.5rem]">
                    <span className="pub-role">
                        {(() => { const Mark = ROLE_ICON[String(role || '').toLowerCase()] || BuildingLibraryIcon; return <Mark aria-hidden="true" />; })()}
                        <span>{ROLE_COPY[String(role || '').toLowerCase()] || 'Portal'}</span>
                    </span>
                    <h2 className="pub-title mt-3.5 text-slate-900">Sign in</h2>
                    <p className="mt-1.5 text-sm leading-relaxed text-[#64748b] [text-wrap:balance]">
                        Use the username and password you were given for this portal.
                    </p>

                    <div className="mt-5 space-y-3">
                        {/* `role="status"` rather than `alert`: the message is
                            already on screen when the page loads, so it is a
                            statement of the current state, not an interruption. */}
                        {endedReason &&
                            <div role="status" className="pub-note pub-note-warn">
                                <ExclamationTriangleIcon aria-hidden="true" />
                                <span>{endedReason}</span>
                            </div>
                        }
                        {/* This one IS an interruption — it appeared in answer
                            to something the user just did. */}
                        {refusal &&
                            <div role="alert" className="pub-note pub-note-error">
                                <ExclamationCircleIcon aria-hidden="true" />
                                <span>{refusal}</span>
                            </div>
                        }
                    </div>

                    {/* `noValidate`, and no `method="POST"`. The form is handled
                        entirely in JS; the attribute only ever described a
                        navigation that never happens, and the browser's own
                        bubble would have fought the field messages below. */}
                    <form ref={formRef} className="mt-5 space-y-4" onSubmit={handleLogin} noValidate>
                        <div>
                            {/* These were bound to `loginSchema?.username` /
                                `loginSchema?.password` — properties of the YUP
                                SCHEMA object, which does not have them (yup
                                keeps its fields under `.fields`). Both were
                                therefore permanently `undefined`, so React
                                treated the inputs as uncontrolled and the only
                                copy of what the user typed lived in the DOM.
                                It appeared to work because `handleChange` still
                                populated `form`, but nothing could reset or
                                prefill the fields, and React switches an input
                                from uncontrolled to controlled the moment a
                                value arrives. Bound to the actual state now.

                                `autoComplete` is what lets a password manager
                                fill and save these; without it browsers guess,
                                and on a `<form method="POST">` they often guess
                                wrong. */}
                            <TextInput
                                input={{
                                    name: 'username', label: 'Username',
                                    autoComplete: 'username', autoFocus: true,
                                    placeholder: 'Your username',
                                }}
                                value={form.username} error={errors.username}
                                onChange={handleChange} />
                        </div>
                        <div onKeyDown={readCaps} onKeyUp={readCaps}>
                            <PasswordInput
                                input={{
                                    name: 'password', label: 'Password',
                                    autoComplete: 'current-password',
                                    placeholder: 'Your password',
                                }}
                                value={form.password} error={errors.password}
                                onChange={handleChange} />
                            {capsOn &&
                                <p role="status"
                                    className="mt-1.5 flex items-center gap-1.5 px-2 text-xs font-medium text-amber-700">
                                    <LockClosedIcon className="h-3.5 w-3.5" aria-hidden="true" />
                                    Caps Lock is on
                                </p>
                            }
                        </div>
                        <button type="submit" disabled={status}
                            className="pub-btn pub-btn-primary w-full !mt-6">
                            {status && <span aria-hidden="true" className="pub-spin" />}
                            {status ? "Signing in…" : "Sign in"}
                        </button>
                    </form>

                </div>

                <div className="mx-auto mt-4 w-full max-w-[26rem] lg:hidden">
                    <Glance />
                </div>

                <p className="pub-foot pub-signin-foot mx-auto mt-6 w-full max-w-[26rem] text-slate-500 2xl:max-w-[27.5rem]">
                    <span>Powered by Cent IT Solutions Pvt. Ltd.</span>
                    <span className="flex items-center gap-x-3">
                        <a href="/privacy_policy">Privacy Policy</a>
                        <a href="/support">Support</a>
                    </span>
                </p>
            </div>
        </div>
    )
}

export default Login;
