import { memo, useCallback } from "react";
import {
    Typography,
    List,
    ListItem,
    ListItemPrefix,
    ListItemSuffix,
    Accordion,
    AccordionHeader,
    AccordionBody,
} from "@material-tailwind/react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { useAppContext } from "@/contexts/AppContext";

export const Menu = memo(function Menu({ menu, viewName, onClick, isClicked = false, mini = false }) {
    // In the mini rail the label is gone, so the row's name has to be reachable
    // some other way or the icons are a guessing game. A native title is the
    // right weight here: it costs nothing, it works on every row, and it does
    // not fire a tooltip on all ~40 rows once the labels are back.
    const hint = mini ? (menu?.name || '') : undefined;
    return (
        <>
            {onClick ? (
                <ListItem
                    title={hint}
                    className="app-menu-item py-1.5"
                    onClick={async () => {
                        await onClick();
                    }}>
                    <ListItemPrefix>{menu?.prefix || ''}</ListItemPrefix>
                    {menu?.name || ''}
                    <ListItemSuffix>{menu?.suffix || ''}</ListItemSuffix>
                </ListItem>
            ) : (
                // `aria-current="page"` is how a screen reader is told WHICH of
                // forty links is the open one. The pill said it visually and
                // said nothing at all otherwise.
                <Link href={`#${viewName}`} title={hint} aria-current={isClicked ? 'page' : undefined}>
                    {/* `app-menu-item[-active]` carry the whole look: every
                        school renders on a palette now, and each one states
                        its own hover and selected tint for its own rail
                        (globals.css, SCHOOLCORE layer). */}
                    <ListItem className={`app-menu-item py-2 ${isClicked ? 'app-menu-item-active font-semibold' : 'bg-transparent font-normal'}`}>
                        <ListItemPrefix>{menu?.prefix || ''}</ListItemPrefix>
                        <span className="w-max">{menu?.name || ''}</span>
                        <ListItemSuffix>{menu?.suffix || ''}</ListItemSuffix>
                    </ListItem>
                </Link>
            )}
        </>
    );
});

/**
 * One row of the navigation rail — a leaf, or a group that unfolds into more
 * rows.
 *
 * WHO OWNS "OPEN"
 * Each group used to own a `useState` of its own, which is why several could be
 * expanded at once: no group could see any other, so none could stand aside.
 * The open branch is now ONE value on AppContext (`openMenuPath`) and every
 * group reads its own state out of it. A path holds one entry per depth, so
 * "only one submenu open at a time" is a property of the data structure — not a
 * rule some future menu row could forget to follow.
 *
 * `alwaysOpen` is gone from the menu config with it. It pinned four groups open
 * before the user had touched anything, which is the same problem stated in
 * data; the branch containing the CURRENT page opens instead, which is the
 * thing `alwaysOpen` was reaching for.
 */
function CustomAccordionMenu({ parent, menu, forceOpen = false }) {
    const {
        menu: { selectedMenu, openMenuPath, toggleMenuGroup },
        sidebar: { sidebarOpened, setSidebarOpened },
    } = useAppContext();

    const viewName = getViewName(parent, menu?.view);
    // Depth in the tree, straight off the path: `payment` is 0,
    // `exams.results` is 1, `exams.results.number-system` is 2. The open path is
    // indexed by depth, so a group's own state is a single lookup — no counter
    // threaded down through the recursion, and nothing to get out of step.
    const depth = viewName ? viewName.split('.').length - 1 : 0;
    // `forceOpen` is the rail's search: while a filter is on, every surviving
    // group is unfolded, because the whole point of the filter is that its
    // matches are ON SCREEN. It has to be a prop rather than initial state —
    // React keeps these instances alive across a filter change, so a group that
    // was closed when the user started typing would simply stay closed.
    const isOpen = forceOpen || openMenuPath?.[depth] === viewName;

    // Collapsed rail = icons only, so a group has no room to unfold a submenu.
    // Opening one is the clearest possible request for the labels back, so the
    // click expands the rail and the accordion opens into it.
    const mini = !sidebarOpened;

    const onGroupClick = useCallback(() => {
        if (mini) setSidebarOpened(true);
        toggleMenuGroup(viewName);
    }, [mini, setSidebarOpened, toggleMenuGroup, viewName]);

    // Hooks first, THEN the early return. This check used to sit above
    // `useAppContext()`, so a hidden row rendered a different number of hooks
    // than a visible one — the exact shape React warns about, and a live
    // crash-in-waiting the day a menu row's `hidden` flag became dynamic.
    if (menu?.hidden) return null;

    if (!menu?.submenu) {
        return (
            <Menu menu={menu} viewName={viewName} onClick={menu?.onClick}
                isClicked={viewName === selectedMenu} mini={mini} />
        );
    }

    return (
        <Accordion
            open={isOpen}
            className="bg-transparent"
            icon={
                <ChevronDownIcon
                    strokeWidth={2.5}
                    aria-hidden="true"
                    className={`mx-auto h-4 w-4 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                />
            }>
            <ListItem title={mini ? menu?.name : undefined}
                className={`app-menu-group p-0 ${isOpen ? 'app-menu-group-open' : ''}`}
                selected={isOpen}>
                <AccordionHeader
                    onClick={onGroupClick}
                    aria-expanded={isOpen}
                    className="border-b-0 p-1.5 m-0">
                    <ListItemPrefix>{menu?.prefix || ''}</ListItemPrefix>
                    <Typography color="blue-gray" className="mr-auto font-normal">
                        {menu?.name}
                    </Typography>
                </AccordionHeader>
            </ListItem>
            <AccordionBody className="app-rail-submenu py-0 pl-5">
                <List className="p-0">
                    {
                        menu?.submenu?.map((item, i) => (
                            <MenuRow key={`${viewName}.${item?.view || i}`}
                                parent={viewName} menu={item} forceOpen={forceOpen} />
                        ))
                    }
                </List>
            </AccordionBody>
        </Accordion>
    );
}

// The tree is re-rendered on every context change (a notification, a fiscal
// year, a page load). Nothing about a row changes unless its own menu data or
// its parent does, and the two values it really depends on — the open path and
// the selected view — come through context, which `memo` does not block.
const MenuRow = memo(CustomAccordionMenu);
export default MenuRow;

function getViewName(parent, menu_view) {
    return [...(parent ? [parent] : []), menu_view].join('.')
}
