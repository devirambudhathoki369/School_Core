import AttentionBox from "@/components/AttentionBox";
import { useAppContext } from "@/contexts/AppContext";

const SHARED_LIBRARY_KEY = "uses_shared_library";

export function isUsingSharedLibrary(user) {
    if (user?.profile?.preferences?.[SHARED_LIBRARY_KEY]) return true;
    return false;
}

/**
 * Wraps a page that a school borrowing another school's library may not open.
 * The check lives in its own component, so the page's hooks always run in the
 * same order: returning early inside the page would change how many hooks it
 * calls once the signed-in user has loaded, and React would throw.
 */
export function ownLibraryOnly(Page) {
    function OwnLibraryOnly(props) {
        const { user: { user } } = useAppContext();
        if (isUsingSharedLibrary(user)) return <UsingSharedLibraryAlert />;
        return <Page {...props} />;
    }
    OwnLibraryOnly.displayName = `ownLibraryOnly(${Page.displayName || Page.name})`;
    return OwnLibraryOnly;
}

export function UsingSharedLibraryAlert() {
    return (
        <AttentionBox title={"Unauthorized!"}
            description={description} />
    )
}

const description = `You use a shared library.
You're only allowed to issue/return book and see reports!`;