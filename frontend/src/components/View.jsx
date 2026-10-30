import { Button, IconButton, Tooltip, Typography } from "@material-tailwind/react";
import { useAppContext } from "@/contexts/AppContext";
import { MapPinIcon, PhoneIcon } from "@heroicons/react/24/solid";
import { BellIcon, Bars3Icon, CalendarIcon, HomeIcon, Squares2X2Icon, ChatBubbleLeftIcon, ChevronDownIcon, ChevronRightIcon, MoonIcon, SunIcon } from "@heroicons/react/24/outline";
import { Fragment, useEffect, useState } from "react";
import Head from "next/head";
import ShortcutsView from "./ShortcutsView";
import FiscalYearView from "./views/profiles/school/FiscalYearView";
import ConfirmationPrompt from "./ConfirmationPrompt";
import ErrorBoundary from "./ErrorBoundary";
import NpDatetimeView from "./NpDatetimeView";
import Image from "next/image";
import RenewAlert from "./RenewAlert";
import Users from "@/configs/Users";
import OurLogo from "@/components/OurLogo";
import { formatImagePath } from "@/methods/formatMediaPath";
import BusTrackingHeaderLink from "./views/bus_tracking/HeaderLink";
import { useColorMode } from "@/configs/colorMode";
import { labelTrail } from "@/methods/menuTree";

// Light or dark, for whoever is at this screen (configs/colorMode.js).
function ModeButton({ mode, toggle, className = "" }) {
    const dark = mode === "dark";
    return (
        <Tooltip content={dark ? "Light mode" : "Dark mode"} className="text-xs">
            <Button aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} aria-pressed={dark}
                className={`app-tool-btn shrink-0 ${className}`} type="button" variant="text" onClick={toggle}>
                {dark ? <SunIcon className="icon" /> : <MoonIcon className="icon" />}
            </Button>
        </Tooltip>
    );
}

function View({ type, children, selectedMenu }) {
    const { sidebar: { sidebarOpened, setSidebarOpened },
        user: { user },
        fiscalYear: { year, showFiscalYearPicker, setShowFiscalYearPicker },
        notification: { updateNotification },
        prompt: { toggleConfirmationPrompt },
        menu: { menus: menuBundle } } = useAppContext();
    // 
    const { mode, toggle: toggleMode } = useColorMode();
    const [showShortcuts, setShowShortcuts] = useState(false);
    function toggleShortcuts() {
        setShowShortcuts(state => !state);
        if (showFiscalYear) toggleFiscalYearView();
    }
    // 
    // Held in AppContext, not here, so the academic-year notice on any page can
    // open this same popover instead of only describing where it is.
    const showFiscalYear = showFiscalYearPicker;
    function toggleFiscalYearView() {
        setShowFiscalYearPicker(state => !state);
        if (showShortcuts) toggleShortcuts();
    }
    // 
    // Sentence case, the way the rail names the same pages ("Payroll /
    // Staff ledger"). The trail was upper-cased, so every screen carried a
    // line of capitals at the top that read as shouting and was slower to scan.
    // The menu's own labels, so the trail says "Fees & payments / Collect
    // fees" -- the words the rail uses -- rather than the address's
    // ("Payment / Student").
    selectedMenu = labelTrail(menuBundle?.menu, selectedMenu);
    const crumbTrail = (
        <>
            <HomeIcon aria-hidden="true" />
            {selectedMenu.map((menu, i) => (
                <Fragment key={i}>
                    <span className="app-crumb-sep" aria-hidden="true">/</span>
                    <span className={i === selectedMenu.length - 1 ? 'app-crumb-current' : ''}
                        aria-current={i === selectedMenu.length - 1 ? 'page' : undefined}>{menu}</span>
                </Fragment>
            ))}
        </>
    );
    // On a wide screen the page is said as a TITLE with the path to it above
    // ("Home › Payment ›" over "Student payment"), beside the school's name
    // plate — where you are, next to who you are. Narrower screens keep the
    // one-line trail in a strip under the bar.
    const pageTitle = selectedMenu[selectedMenu.length - 1] || '';
    const pageParents = selectedMenu.slice(0, -1);
    // 
    // The page shell is a flex COLUMN: the header takes the height it needs and
    // the content takes the rest. It used to be a stack of percentage caps —
    // `.view` at `max-h-[80%]` and `.viewc` at 95/98% — which meant a fifth of
    // every screen was dead canvas below the content, and the scroll container
    // ended well above the bottom of the window. `min-h-0` is what lets a flex
    // child actually shrink and scroll instead of overflowing its parent.
    //
    // A `viewWidth` string used to be published from here too — `md:w-[75%]` /
    // `md:w-[96%]` of the VIEWPORT — and four pages applied it to a
    // `position: fixed` panel that already began after the sidebar, so each one
    // overran the right edge of the page and sat outside `.viewc`'s scrolling.
    // Those panels are ordinary `w-full` blocks now and nothing reads it, so it
    // is gone rather than left around to be picked up again.
    //
    // A missing fiscal year is a real warning and must stay visible — but it was
    // said with a red glyph on a green button, which reads as a colour mistake
    // rather than a state. The whole control carries the state instead: settled
    // green when the years are chosen, alarm red when one is missing.
    const fiscalYearSet = !!(year?.economic_year && year?.academic_year && year?.accounting_economic_year);
    const fiscalYearColor = fiscalYearSet ? "is-ok" : "is-warn";
    // 
    const schoolLogo = user?.profile?.school_logo || user?.profile?.logo;
    // --
    return (
        <>
            <Head>
                <title>{[...selectedMenu, 'SchoolCore'].reverse().join(' · ')}</title>
            </Head>
            <div className={`view flex flex-col h-screen max-h-screen min-w-0 flex-1 overflow-hidden`}>
                {/*  */}
                <>
                    {(type === Users.ADMIN || type === Users.STAFF) &&
                        <div className="view-header">
                            {/*
                                Mobile-only header.
                                Kept as its own row (not relying on flex-wrap) so
                                the hamburger is guaranteed to be the first
                                clickable element regardless of inner content
                                widths. Tiny avatar + truncated school name +
                                two essential action buttons.
                            */}
                            <div className="md:hidden flex items-center gap-x-2 p-2 w-full bg-white">
                                <IconButton
                                    aria-label="open sidebar"
                                    variant="text"
                                    className="shrink-0 relative z-20"
                                    onClick={() => setSidebarOpened((s) => !s)}
                                >
                                    <Bars3Icon className="h-6 w-6" />
                                </IconButton>
                                <div className="app-plate flex items-center gap-x-2 flex-1 min-w-0">
                                    {schoolLogo ?
                                        // unoptimized: the backend media host is Cloudflare-fronted and
                                        // the on-VPS optimizer gets bot-challenged fetching it (upstream
                                        // 403), so let the browser fetch it directly like ReportHeader.
                                        <Image unoptimized alt="School logo" width={32} height={32}
                                            src={formatImagePath(schoolLogo)}
                                            className="app-school-logo h-8 w-8 shrink-0"
                                            onContextMenu={(e) => { e.preventDefault() }} loading="lazy" />
                                        : <OurLogo size={32} />
                                    }
                                    <p className="app-school-name truncate flex-1 min-w-0">
                                        {user?.profile?.school_name || user?.profile?.name || user?.full_name || user?.username || "User"}
                                    </p>
                                </div>
                                {/* the same order as the wide bar: years, then shortcuts */}
                                <BusTrackingHeaderLink />
                                <ModeButton mode={mode} toggle={toggleMode} />
                                <Tooltip content={fiscalYearSet ? "Fiscal years" : "Fiscal years — one is not set"} className="text-xs">
                                    <Button aria-label="select fiscal years"
                                        className={`app-tool-btn app-year-chip shrink-0 ${fiscalYearColor}`}
                                        type="button" variant="text"
                                        onClick={toggleFiscalYearView}>
                                        <CalendarIcon className="icon" />
                                    </Button>
                                </Tooltip>
                                <Tooltip content={"Shortcuts"} className="text-xs">
                                    <Button aria-label="menu shortcuts"
                                        className="app-tool-btn shrink-0" type="button" variant="text"
                                        onClick={toggleShortcuts}>
                                        <Squares2X2Icon className="icon" />
                                    </Button>
                                </Tooltip>
                            </div>
                            {/* Desktop header. */}
                            <div className="hidden md:block">
                                <div className="app-topbar w-full flex justify-between items-center gap-x-4">
                                    <div className="flex items-center gap-x-2.5 min-w-0 flex-1">
                                        {/* The rail's collapse control, moved off the
                                            page edge and into the one place every user
                                            already looks for it — and the same icon the
                                            phone header uses, so the two layouts teach
                                            each other. */}
                                        <Tooltip content={sidebarOpened ? "Collapse menu" : "Expand menu"} className="text-xs">
                                            <IconButton
                                                aria-label="toggle sidebar"
                                                aria-expanded={sidebarOpened}
                                                variant="text"
                                                className="app-rail-toggle shrink-0 rounded-lg"
                                                onClick={() => setSidebarOpened((s) => !s)}
                                            >
                                                <Bars3Icon className="h-6 w-6" />
                                            </IconButton>
                                        </Tooltip>
                                        {/* The name plate: the school's logo, name and how
                                            to reach it, set on a tint of the school's own
                                            colour — one object, not three loose items. */}
                                        <div className="app-plate flex items-center gap-x-3 min-w-0">
                                            {schoolLogo ?
                                                <Image unoptimized alt="School logo" width={42} height={42}
                                                    src={formatImagePath(schoolLogo)}
                                                    className="app-school-logo h-[42px] w-[42px] shrink-0"
                                                    onContextMenu={(e) => { e.preventDefault() }} loading="lazy" />
                                                : <OurLogo />
                                            }
                                        {/* The school's own name, as the school wrote it, and
                                            the line under it that says where and how to reach
                                            it. It was "Welcome, NAME [SCHOOL]" in teal capitals —
                                            the loudest line on every screen, saying the same
                                            thing on all of them. */}
                                        <div className="school_info flex flex-col min-w-0">
                                            <p className="app-school-name truncate"
                                                title={[user?.profile?.name || user?.full_name || user?.username, user?.profile?.school_name].filter(Boolean).join(' · ')}>
                                                {user?.profile?.name || user?.full_name || user?.username || "User"}
                                                {user?.profile?.school_name &&
                                                    <span className="app-school-sub"> · {user.profile.school_name}</span>}
                                            </p>
                                            <div className="app-school-meta flex w-full gap-x-4 items-center min-w-0">
                                                <span className="flex items-center gap-1 capitalize min-w-0">
                                                    <MapPinIcon className="shrink-0" aria-hidden="true" />
                                                    <span className="truncate">{user?.profile?.location || user?.profile?.address}</span>
                                                </span>
                                                <span className="flex items-center gap-1 shrink-0">
                                                    <PhoneIcon className="shrink-0" aria-hidden="true" />
                                                    <span className="whitespace-nowrap">
                                                        {user.profile?.contact || user.profile?.primary_contact || ''}
                                                        {
                                                            ((user.profile?.contact && user.profile?.telephone) ||
                                                                (user.profile?.primary_contact && user.profile?.secondary_contact))
                                                            && ", "
                                                        }
                                                        {user.profile?.telephone || user.profile?.secondary_contact || ''}
                                                    </span>
                                                </span>
                                            </div>
                                        </div>
                                        </div>
                                        <span className="app-topbar-rule hidden xl:block" aria-hidden="true"></span>
                                        <div className="app-page hidden xl:flex flex-col min-w-0">
                                            <nav aria-label="Breadcrumb" className="app-page-trail">
                                                <span>Home</span>
                                                {pageParents.map((menu, i) => (
                                                    <Fragment key={i}>
                                                        <ChevronRightIcon aria-hidden="true" />
                                                        <span>{menu}</span>
                                                    </Fragment>
                                                ))}
                                                <ChevronRightIcon aria-hidden="true" />
                                            </nav>
                                            <span className="app-page-title truncate" aria-current="page">{pageTitle}</span>
                                        </div>
                                    </div>
                                    {/* what day it is | what you can open */}
                                    <div className="app-topbar-tools flex items-center justify-end gap-x-2 shrink-0">
                                        <NpDatetimeView />
                                        <span className="app-topbar-rule" aria-hidden="true"></span>
                                        <div className="flex items-center gap-x-1.5">
                                            <BusTrackingHeaderLink />
                                            {/* The years, named: the button used to be a bare
                                                calendar that said nothing about which year the
                                                school is working in until it was opened. */}
                                            <Tooltip content={fiscalYearSet ? "Fiscal years" : "Fiscal years — one is not set"} className="text-xs">
                                                <Button aria-label="select fiscal years"
                                                    className={`app-tool-btn app-year-chip normal-case ${fiscalYearColor}`}
                                                    type="button" variant="text"
                                                    onClick={() => {
                                                        toggleFiscalYearView();
                                                    }}>
                                                    <CalendarIcon className="icon" />
                                                    <span className="app-year-chip-label hidden lg:inline">{year?.economic_year_name || "Set years"}</span>
                                                    <ChevronDownIcon className="app-year-chip-caret hidden lg:block" aria-hidden="true" />
                                                </Button>
                                            </Tooltip>
                                            <ModeButton mode={mode} toggle={toggleMode} />
                                            <Tooltip content={"Shortcuts"} className="text-xs">
                                                <Button aria-label="menu shortcuts"
                                                    className="app-tool-btn" type="button" variant="text"
                                                    onClick={() => {
                                                        toggleShortcuts();
                                                    }}>
                                                    <Squares2X2Icon className="icon" />
                                                </Button>
                                            </Tooltip>
                                            <>
                                                {process.env.NODE_ENV === 'development' &&
                                                    <>
                                                        <Tooltip content={"Test Notification"} className="text-xs">
                                                            <Button className="m-0 p-2 hover:bg-transparent" type="button" variant="text"
                                                                onClick={() => {
                                                                    updateNotification(null, 'Test Notification!');
                                                                }}>
                                                                <BellIcon className="icon" />
                                                            </Button>
                                                        </Tooltip>
                                                        <Button className="m-0 p-2 hover:bg-transparent" type="button" variant="text"
                                                            onClick={() => {
                                                                toggleConfirmationPrompt({});
                                                            }}>
                                                            <ChatBubbleLeftIcon className="icon" />
                                                        </Button>
                                                    </>
                                                }
                                            </>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            {/* Under the bar on anything narrower than the wide
                                layout: the trail on one line, free to scroll
                                sideways without squeezing the bar above it. A
                                phone has no room for the date up there, so the
                                strip carries it. */}
                            <nav aria-label="Breadcrumb" className="app-crumbs xl:hidden flex items-center justify-between gap-x-3 px-3 py-1.5 bg-white overflow-x-auto">
                                <div className="app-crumb-trail">{crumbTrail}</div>
                                {user?.today &&
                                    <span className="app-crumbs-date md:hidden shrink-0 tabular-nums">{user.today}</span>}
                            </nav>
                        </div>
                    }
                    {/* The SUPERADMIN console had no header at all — the whole
                        block above is gated to admin/staff — so it opened
                        straight onto raw content with no title, no breadcrumb
                        and no way to collapse the rail. It gets the same shell
                        the schools have, minus the parts that need a school:
                        no logo, no address, no fiscal-year picker. */}
                    {/* A CANTEEN USER signs in to the canteen alone: the
                        school's name plate and who is at the counter, the page,
                        the date — and none of the school's tools (years,
                        shortcuts, the bus), which their sign-in cannot open. */}
                    {type === Users.CANTEEN &&
                        <div className="view-header">
                            <div className="app-topbar w-full flex items-center justify-between gap-x-3">
                                <div className="flex items-center gap-x-2.5 min-w-0 flex-1">
                                    <Tooltip content={sidebarOpened ? "Collapse menu" : "Expand menu"} className="text-xs">
                                        <IconButton aria-label="toggle sidebar" aria-expanded={sidebarOpened}
                                            variant="text" className="app-rail-toggle shrink-0 rounded-lg relative z-20"
                                            onClick={() => setSidebarOpened((s) => !s)}>
                                            <Bars3Icon className="h-6 w-6" />
                                        </IconButton>
                                    </Tooltip>
                                    <div className="app-plate flex items-center gap-x-3 min-w-0">
                                        {schoolLogo ?
                                            <Image unoptimized alt="School logo" width={42} height={42}
                                                src={formatImagePath(schoolLogo)}
                                                className="app-school-logo h-8 w-8 md:h-[42px] md:w-[42px] shrink-0"
                                                onContextMenu={(e) => { e.preventDefault() }} loading="lazy" />
                                            : <OurLogo size={32} />
                                        }
                                        <div className="school_info flex flex-col min-w-0">
                                            <p className="app-school-name truncate"
                                                title={[user?.profile?.school_name, user?.profile?.name].filter(Boolean).join(' · ')}>
                                                {user?.profile?.school_name || "Canteen"}
                                            </p>
                                            <p className="app-school-meta truncate">
                                                Canteen · {user?.profile?.name || user?.username}
                                            </p>
                                        </div>
                                    </div>
                                    <span className="app-topbar-rule hidden xl:block" aria-hidden="true"></span>
                                    <div className="app-page hidden xl:flex flex-col min-w-0">
                                        <nav aria-label="Breadcrumb" className="app-page-trail">
                                            <span>Home</span>
                                            {pageParents.map((menu, i) => (
                                                <Fragment key={i}>
                                                    <ChevronRightIcon aria-hidden="true" />
                                                    <span>{menu}</span>
                                                </Fragment>
                                            ))}
                                            <ChevronRightIcon aria-hidden="true" />
                                        </nav>
                                        <span className="app-page-title truncate" aria-current="page">{pageTitle}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-x-2 shrink-0">
                                    <span className="hidden md:flex items-center"><NpDatetimeView /></span>
                                    <ModeButton mode={mode} toggle={toggleMode} />
                                </div>
                            </div>
                            <nav aria-label="Breadcrumb" className="app-crumbs xl:hidden flex items-center justify-between gap-x-3 px-3 py-1.5 bg-white overflow-x-auto">
                                <div className="app-crumb-trail">{crumbTrail}</div>
                                {user?.today &&
                                    <span className="app-crumbs-date md:hidden shrink-0 tabular-nums">{user.today}</span>}
                            </nav>
                        </div>
                    }
                    {type === Users.SUPERADMIN &&
                        <div className="view-header">
                            <div className="app-topbar w-full flex items-center justify-between gap-x-3">
                                <div className="flex items-center gap-x-2 min-w-0">
                                    <Tooltip content={sidebarOpened ? "Collapse menu" : "Expand menu"} className="text-xs">
                                        <IconButton aria-label="toggle sidebar" aria-expanded={sidebarOpened}
                                            variant="text" className="app-rail-toggle shrink-0 rounded-lg"
                                            onClick={() => setSidebarOpened((s) => !s)}>
                                            <Bars3Icon className="h-6 w-6" />
                                        </IconButton>
                                    </Tooltip>
                                    <OurLogo size={30} />
                                    <div className="min-w-0">
                                        <Typography className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-gray-500 leading-3">
                                            SchoolCore
                                        </Typography>
                                        <Typography className="truncate text-base font-bold text-gray-800 leading-5">
                                            Superadmin Console
                                        </Typography>
                                    </div>
                                </div>
                                <div className="flex items-center gap-x-2 shrink-0">
                                    <NpDatetimeView />
                                    <ModeButton mode={mode} toggle={toggleMode} />
                                    <Typography className="hidden lg:block truncate max-w-[12rem] text-sm font-semibold text-gray-600">
                                        {user?.username || ''}
                                    </Typography>
                                </div>
                            </div>
                            <nav aria-label="Breadcrumb" className="app-crumbs flex items-center px-3 py-1.5 bg-white border-t overflow-x-auto">
                                <div className="app-crumb-trail">{crumbTrail}</div>
                            </nav>
                        </div>
                    }
                </>
                <>
                    <div className={`viewc flex-1 min-h-0 rounded-md overflow-y-auto m-0`}>
                        <>
                            {
                                (showShortcuts && type === "admin") &&
                                <div>
                                    <ShortcutsView toggleShortcuts={toggleShortcuts} />
                                </div>
                            }
                            {
                                showFiscalYear &&
                                <FiscalYearView toggleFiscalYearView={toggleFiscalYearView} />
                            }
                            <ConfirmationPrompt />
                            <RenewAlert />
                        </>
                        {/* Wraps the VIEW only, not the shell. A render error in
                            one report used to unmount the whole tree and leave a
                            blank white page with the rail gone; now the rail,
                            header and fiscal-year picker survive and the user can
                            simply pick another menu item.

                            `resetKey` is the active menu path, so navigating away
                            clears the error instead of pinning the failure over
                            whatever screen is opened next. */}
                        <ErrorBoundary resetKey={selectedMenu?.join('.')}>
                            {/* Keyed on the page so it remounts on every
                                navigation and the page settles in (a short rise
                                and fade, `.app-view-enter` in globals.css)
                                instead of swapping in a single frame. */}
                            <div key={selectedMenu?.join('.')} className="app-view-enter h-full">
                                {children}
                            </div>
                        </ErrorBoundary>
                    </div>
                </>
            </div >
        </>
    )
}

export default View;
