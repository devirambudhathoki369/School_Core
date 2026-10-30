import { adminMenu, superAdminMenu, canteenUserMenu } from "@/configs/menus";
import { TESTED_PERMISSIONS } from "@/configs/permissions";
import { adminViews, superAdminViews, canteenViews } from "@/configs/views";
import useFiscalYears from "@/hooks/fiscalYears";
import filterViews from "@/methods/filterViews";
import { getAccountingEconomicYears, getClosedAccountingEconomicYears } from "@/services/functions/accounting/accounting_economic_year";
import { fetchClassesInOrder } from "@/services/functions/classes";
import { getAcademicYearMappings, getAcademicYears, getClosedAcademicYears } from "@/services/functions/fiscalYear";
import { useRouter } from "next/router";
import { createContext, useContext, useCallback, useEffect, useState } from "react";
import TempStateContextProvider from "./TempStateContext";
import { options, gradeOptions2, yearOptions, semesterOptions } from "@/components/inputs/options/education";
import { enableSentry, disableSentry } from "@/methods/sentry-setup";
import { applyTheme, safeTheme, UI_THEME_CONSOLE } from "@/configs/uiThemes";
import { filterViewsByModules, menuAccessKey, moduleAllowed } from "@/configs/moduleGates";

const AppContext = createContext({});

const useAppContext = () => {
    return useContext(AppContext);
}

const PAGE = {
    admin: {
        menu: adminMenu,
        views: adminViews
    },
    superadmin: {
        menu: superAdminMenu,
        views: superAdminViews
    },
    superuser: {
        menu: superAdminMenu,
        views: superAdminViews
    }
};

const AppContextProvider = ({ children }) => {
    const [setupDone, setSetupDone] = useState(false);
    // Sidebar starts closed so the mobile overlay never blocks the
    // hamburger on first paint (hydration also matches). Sidebar.jsx flips
    // it open on desktop in a mount effect.
    const [sidebarOpened, setSidebarOpened] = useState(false);
    const [menus, setMenus] = useState({});
    const [selectedMenu, setSelectedMenu] = useState('');
    /**
     * THE ONE open branch of the menu tree.
     *
     * Every group row used to hold its OWN `open` boolean, so nothing in the
     * app knew how many groups were expanded — and `alwaysOpen: true` on
     * Dashboard, Payment and two nested groups meant several were pinned open
     * before the user touched anything. The rail routinely showed three or four
     * unfolded groups at once and the row you wanted was below the fold.
     *
     * The state is now a single PATH: the chain of group views that is open,
     * outermost first — `[]`, or `['payment']`, or
     * `['exams', 'exams.results', 'exams.results.number-system']`. Because a
     * path can only hold ONE entry per depth, two sibling groups can never both
     * be open; opening one closes the other by construction rather than by a
     * cleanup effect that could miss a case.
     */
    const [openMenuPath, setOpenMenuPath] = useState([]);
    const [user, setUser] = useState(null);
    const [notification, setNotification] = useState({
        status: null,
        message: null
    });
    // fiscal-years
    const { fiscalYear } = useFiscalYears();
    /**
     * The top-right fiscal-year popover lived in `View`'s own state, so the only
     * thing that could open it was the calendar button next to it. Every screen
     * that needed the user to check their academic year could therefore only
     * *tell* them to ("Select correct academic year please!") and point at a
     * button somewhere off in the header. Holding the flag here lets the notice
     * on the page open the very picker it is talking about.
     */
    const [showFiscalYearPicker, setShowFiscalYearPicker] = useState(false);
    // confirmation-prompts
    const promptSchema = { header: '', sub_header: '', body: '', remarks: '', ask_reason: false, onConfirm: () => null };
    const [showConfirmationPrompt, setShowConfirmationPrompt] = useState(false);
    const [promptData, setPromptData] = useState({ ...promptSchema });
    // school>classes
    const [classesBackup, setClassesBackup] = useState([]);
    const [coursesBackup, setCoursesBackup] = useState([]);
    const [facultyNames, setFacultyNames] = useState({});
    const [classes, setClasses] = useState([]); // formatted classes according to grade/faculties;

    // The school's interface theme. It arrives with the profile rather than in
    // a request of its own, so the first painted screen is already in the right
    // colours instead of flashing one palette and correcting itself. A school
    // on classic (the default, and anyone who has never been touched) resolves
    // to no attribute at all, which is what keeps the stylesheet's themed rules
    // from matching them.
    // A superadmin has no school and therefore no profile theme. The console
    // used to fall back to Classic (a per-operator localStorage preference that
    // defaulted there), which meant the one screen that acts ACROSS schools was
    // also the one screen wearing no design at all. It now has a palette of its
    // own — graphite rail, indigo accent — applied permanently, so the console
    // is instantly distinguishable from any school and cannot drift per machine.
    const isConsole = user?.role === "superuser" || user?.role === "superadmin";
    const uiTheme = isConsole ? UI_THEME_CONSOLE : safeTheme(user?.profile?.ui_theme);
    useEffect(() => {
        if (typeof document === "undefined") return;
        applyTheme(document.documentElement, uiTheme);
    }, [uiTheme]);

    function updateNotification(status, message) {
        setNotification({ status, message });
    }
    function getLog(tid) {
        const timestamp = Date.now();
        return {
            uid: user?.profile?.school || user?.profile?.id,
            tid,
            timestamp
        }
    }
    // 
    // Where a session opens when the URL carries no fragment — i.e. every fresh
    // sign-in. `staff`/`student` sit on the admin menu tree (filtered by their
    // permissions), so they share its dashboard; without an entry here they
    // resolved to no view at all and landed on "COMING SOON!!!".
    const FALLBACK_VIEWS = {
        'admin': 'dashboard',
        'staff': 'dashboard',
        'student': 'dashboard',
        'superadmin': 'dashboard',
        'superuser': 'dashboard',
        // A canteen user has no dashboard: they open on the first canteen page
        // they hold (the counter, for most of them).
        'canteen': canteenLanding(user),
    };
    const router = useRouter();
    useEffect(() => {
        const USERTYPE = router.asPath.split("#")[0].split("?")[0].replaceAll('/', ''); // /admin | /superadmin;
        const DEFAULT_VIEW = `NEXT_PUBLIC_DEFAULT_${USERTYPE}_VIEW`;
        const _sm = router.asPath.split('#')?.[1] ||
            process?.env?.[DEFAULT_VIEW] ||
            FALLBACK_VIEWS[USERTYPE];
        setSelectedMenu(_sm);
    }, [router.query, user]);

    /**
     * Navigating opens the branch the page lives in, and closes every other.
     *
     * The open path is simply the chain of ancestors of the active view:
     * `exams.results.number-system.class-result` unfolds `exams`, then
     * `exams.results`, then `exams.results.number-system` — and nothing else.
     * A leaf that hangs off the root (`student-photos`) unfolds nothing, so
     * arriving there tidies the rail up behind you.
     *
     * This also covers the deep-link case the old per-row state could not: the
     * command palette and a pasted `#…` URL both change `selectedMenu` without
     * anyone clicking a group, and the rail now follows them.
     */
    useEffect(() => {
        if (!selectedMenu) return;
        const parts = String(selectedMenu).split('.');
        setOpenMenuPath(parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('.')));
    }, [selectedMenu]);

    /**
     * Open or close ONE group, named by its full view path
     * (`exams.results.number-system`).
     *
     * Closing keeps the ancestors and drops this group and everything nested
     * under it. Opening rebuilds the branch FROM THE VIEW PATH rather than
     * appending to whatever was there: opening a group necessarily means its
     * parents are open too, and deriving the whole chain is what guarantees the
     * invariant this state exists to hold — entry `i` is always the group at
     * depth `i`, so two groups can never occupy the same level.
     *
     * Appending instead (`[...prev.slice(0, depth), viewName]`) looks
     * equivalent and is not: if the parent chain is not already open, `slice`
     * returns something shorter than `depth` and the entry lands at the wrong
     * index — after which the group can never match itself again and a second
     * click appends a DUPLICATE rather than closing it. Caught by
     * `src/tests/sidebar-single-open-submenu.js`, which is why that file exists.
     */
    const toggleMenuGroup = useCallback((viewName) => {
        if (!viewName) return;
        const parts = String(viewName).split('.');
        const depth = parts.length - 1;
        setOpenMenuPath(prev => (
            prev[depth] === viewName
                ? prev.slice(0, depth)
                : parts.map((_, i) => parts.slice(0, i + 1).join('.'))
        ));
    }, []);
    // 
    function loadFiscalYears(years) {
        const formattedYears = fiscalYear.saveYears({
            academicYears: years.academicYears,
            closedAcademicYears: years.closedAcademicYears,
            accountingEconomicYears: years.accountingEconomicYears,
            closedAccountingEconomicYears: years.closedAccountingEconomicYears
        });
        years = { ...years, ...formattedYears };
        // 
        fiscalYear.setFYKeys({ academic_year: years.academic_year_key, accounting_economic_year: years.accounting_economic_year_key });
        const academic_year = fiscalYear.getYear(years.academic_year_key) || '',
            economic_year = user?.profile?.economic_year || '',
            accounting_economic_year = fiscalYear.getYear(years.accounting_economic_year_key) || '';
        const academic_year_name = fiscalYear.getAcademicYearName(academic_year, years.academicYears),
            economic_year_name = user?.profile?.economic_year__name || '',
            accounting_economic_year_name = fiscalYear.getAccountingEconomicYearName(accounting_economic_year, years.accountingEconomicYears);
        // 
        if (!economic_year || !academic_year) {
            updateNotification('', 'Please select fiscal years from top-right corner!');
        }
        fiscalYear.setYear(state => ({
            ...state,
            economic_year, academic_year, accounting_economic_year,
            academic_year_name, economic_year_name, accounting_economic_year_name,
        }));
    }
    function hasFiscalYears(notify = true) {
        // this only checks for economic_year and academic_year which are mostly used!
        const { year } = fiscalYear;
        if (year) {
            const stat = (year?.economic_year && year?.academic_year);
            if (!stat && notify) {
                updateNotification("", "Fiscal years missing!!");
            }
            return stat;
        }
        return false;
    }
    function updateAcademicYear(value /* key or academic-year*/) {
        // key_format: el<yid> or g<yid> or el<yid>g<yid>
        // console.log(value, fiscalYear.assignedAcademicYears);
        if (typeof (value) === "string") {
            value = fiscalYear.assignedAcademicYears?.[value]?.academic_year;
        }
        if (!value) {
            updateNotification('', "Academic year mapping not-found/mis-matched!");
            router.push('/admin#support');
            return;
        }
        const acay = fiscalYear.mappedYears?.["academicYears"]?.[value];
        const academic_year_name = acay?.name;
        // console.log({ academic_year: value, academic_year_name });
        fiscalYear.setYear(state => ({ ...state, academic_year: value || '', academic_year_name }));
        return value;
    }
    function updateAccountingEconomicYear(value /* accounting-economic-year */) {
        if (!value) {
            updateNotification('', "Accounting economic year mismatch!");
            return;
        }
        const aecay = fiscalYear.mappedYears?.["accountingEconomicYears"]?.[value];
        const accounting_economic_year_name = aecay?.name;
        // console.log({ accounting_economic_year: value, accounting_economic_year_name });
        fiscalYear.setYear(state => ({ ...state, accounting_economic_year: value || '', accounting_economic_year_name }));
        return value;
    }
    // 
    function toggleConfirmationPrompt(promptData) {
        setPromptData(promptData);
        setShowConfirmationPrompt(state => !state);
    }
    function resetPrompt() {
        setPromptData({ ...promptSchema });
    }
    // 
    function assignMenu(user) {
        let _menus = {};
        const role = user.role;

        if (role === "canteen") {
            // The canteen and nothing else: its own rail, its own pages, each
            // one this user was given (the server refuses the rest anyway).
            const { menu, views } = filterViews(canteenUserMenu, canteenViews, user?.profile?.permissions || []);
            _menus = {
                menu: filterMenuByProfileFlags(menu, user?.profile),
                views: filterViewsByModules(views, user?.profile),
            };
        } else if (!PAGE?.[role]) {
            const { menu, views } = filterViews(
                adminMenu,
                adminViews,
                user?.profile?.permissions || [],
                // TESTED_PERMISSIONS, // testing permissions;
            );
            _menus = {
                menu: filterMenuByProfileFlags(menu, user?.profile),
                views: filterViewsByModules(views, user?.profile),
            };
            // _menus = { ...PAGE['admin'] };
        } else {
            // NOTE the views line. `PAGE[role].views` is the WHOLE map — a
            // school admin is handed every page there is, and only the menu was
            // ever narrowed. That is fine for permissions (an admin has them
            // all) but wrong for a per-school module: a school that has not
            // been given the hostel could still open `#hostel.rooms` by typing
            // it. The module gate applies to the map itself, so those paths
            // resolve to nothing at all.
            // The superadmin is who grants modules; its own pages are never
            // cut by them (its profile carries no module flags at all).
            const gateModules = role !== 'superadmin';
            _menus = {
                menu: filterMenuByProfileFlags(PAGE[role].menu, user?.profile, '', gateModules),
                views: gateModules ? filterViewsByModules(PAGE[role].views, user?.profile) : PAGE[role].views,
            };
        }
        setMenus(_menus);
    }
    // Drop menu items gated by a profile flag (e.g. { profileFlag: 'time_set_required' })
    // when that flag is not enabled for this school, and every branch or page of
    // a module the school does not have (configs/moduleGates.js) — by its view
    // path, the same key the view map is cut by. Leaves everything else intact.
    function filterMenuByProfileFlags(menuList, profile, parent = '', gateModules = true) {
        return (menuList || []).reduce((acc, item) => {
            if (item?.profileFlag && !profile?.[item.profileFlag]) return acc;
            const path = parent && item?.view ? `${parent}.${item.view}` : (item?.view || parent);
            if (gateModules && item?.view && !moduleAllowed(path, profile)) return acc;
            if (item?.submenu) {
                acc.push({ ...item, submenu: filterMenuByProfileFlags(item.submenu, profile, path, gateModules) });
            } else {
                acc.push(item);
            }
            return acc;
        }, []);
    }
    function extractCourseName(name) {
        const parts = name.split('-');
        return parts.length > 0 ? parts[0] : null;
    }
    async function extractCourses(_classes) {
        // only for education-levels diploma[9] or bachelor[4] or master[5]
        if (_classes?.length > 0) {
            const addedCourses = { 4: [], 5: [], 8: [], 9: [] };
            const courses = _classes.reduce((acc, cls) => {
                const [, class_info,] = cls;
                const EL = class_info.education_level;
                const course_id = class_info?.course
                // A +2 class carries its stream in `course` too; streams are not
                // college courses and have no bucket here — skipping them keeps
                // `acc[EL]` from being undefined, which threw and left every
                // class chooser on its loader.
                if (!(EL in addedCourses)) return acc;
                if (course_id && !addedCourses[EL].includes(course_id)) {
                    const course = {
                        name: extractCourseName(class_info.name),
                        value: course_id,
                    };
                    acc[EL].push(course);
                    acc["all"][course.value] = course.name;
                    addedCourses[EL].push(course_id);
                }
                return acc;
            }, { 4: [], 5: [], 8: [], 9: [], all: {} });
            setCoursesBackup(courses);
            setFacultyNames(getFacultyNames(courses));
        } else {
            setCoursesBackup([]);
        }
    }
    function getFacultyNames(courses) {
        return {
            "el": options.reduce((acc, option) => {
                acc[option.value] = option.name;
                return acc;
            }, {}),
            "g": gradeOptions2.reduce((acc, option) => {
                acc[option.value] = option.name;
                return acc;
            }, {}),
            "c": courses?.["all"] || {},
            "y": yearOptions.reduce((acc, option) => {
                acc[option.value] = option.name + ' year';
                return acc;
            }, {}),
            "s": semesterOptions.reduce((acc, option) => {
                acc[option.value] = option.name + ' sem';
                return acc;
            }, {})
        };
    }
    async function loadClasses(_user = null, hardReset = false) {
        if (classes?.length === 0 || hardReset) {
            const _classes = await fetchClassesInOrder(_user || user);
            await extractCourses(_classes);
            setClassesBackup(_classes);
            return _classes;
        }
        return classes;
    }
    useEffect(() => {
        if (user?.username && user?.token) {
            if (academic_year_access_roles.includes(user?.role)) {
                const academic_year_key = fiscalYear.getAcademicYearKey(user);
                const accounting_economic_year_key = fiscalYear.getAccountingEconomicYearKey(user);
                const schoolID = user?.profile?.school || user?.profile?.id;
                (async () => {
                    if (schoolID) {
                        const [academicYears, closedAcademicYears, accountingEconomicYears, closedAccountingEconomicYears, mappings] =
                            await Promise.all([
                                getAcademicYears(schoolID),
                                getClosedAcademicYears(schoolID),
                                getAccountingEconomicYears(schoolID),
                                getClosedAccountingEconomicYears(schoolID),
                                (async () => {
                                    let mappings = await getAcademicYearMappings(schoolID);
                                    mappings = (mappings || []).reduce((acc, val) => {
                                        const { id, key, academic_year } = val;
                                        acc[key] = { id, academic_year };
                                        return acc;
                                    }, {});
                                    return mappings;
                                })(),
                            ]);
                        loadFiscalYears({ academic_year_key, academicYears, closedAcademicYears, accounting_economic_year_key, accountingEconomicYears, closedAccountingEconomicYears });
                        fiscalYear.setAssignedAcademicYears(mappings);
                        assignMenu(user);
                        setSetupDone(true);
                        // below methods can be done lazy loading!
                        await loadClasses();
                    }
                })();
            } else {
                assignMenu(user);
                setSetupDone(true);
            }
            // 
            enableSentry(user);
        } else {
            disableSentry();
        }
    }, [user?.username]);
    // A module granted or taken away, or a page given, while the portal is
    // open: the session check in `[role].jsx` brings it into the profile, and
    // the menu is drawn again from it. Only once set up — the first drawing is
    // the sign-in's own, above.
    const menuAccess = menuAccessKey(user?.profile);
    useEffect(() => {
        if (setupDone && user?.username) assignMenu(user);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [menuAccess]);
    // 
    return (
        <AppContext.Provider value={{
            status: { setupDone, setSetupDone },
            menu: { menus, selectedMenu, setSelectedMenu, openMenuPath, toggleMenuGroup },
            sidebar: { sidebarOpened, setSidebarOpened },
            user: { user, setUser, getLog },
            fiscalYear: {
                ...fiscalYear, updateAcademicYear, updateAccountingEconomicYear, hasFiscalYears,
                showFiscalYearPicker, setShowFiscalYearPicker,
            },
            notification: { notification, updateNotification },
            theme: { uiTheme, isConsole },
            prompt: { promptSchema, showConfirmationPrompt, toggleConfirmationPrompt, promptData, resetPrompt },
            class: { loadClasses, classesBackup, coursesBackup, classes, setClasses, facultyNames }
        }}>
            <TempStateContextProvider>
                {children}
            </TempStateContextProvider>
        </AppContext.Provider>
    )
}

const academic_year_access_roles = ["admin", "staff"];

/** The first page on a canteen user's rail that they hold. */
function canteenLanding(user) {
    const held = new Set((user?.profile?.permissions || []).map(Number));
    const first = canteenUserMenu.find((page) => !page.id || held.has(page.id));
    return first?.view || 'canteen.my-password';
}

export default AppContextProvider;
export { useAppContext }