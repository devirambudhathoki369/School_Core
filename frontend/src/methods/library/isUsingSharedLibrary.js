import AttentionBox from "@/components/AttentionBox";

const SHARED_LIBRARY_KEY = "uses_shared_library";

export function isUsingSharedLibrary(user) {
    if (user?.profile?.preferences?.[SHARED_LIBRARY_KEY]) return true;
    return false;
}

export function UsingSharedLibraryAlert() {
    return (
        <AttentionBox title={"Unauthorized!"}
            description={description} />
    )
}

const description = `You use a shared library.
You're only allowed to issue/return book and see reports!`;