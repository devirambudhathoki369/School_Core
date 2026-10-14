import { useRouter } from "next/router";
import { MapIcon, ArrowLeftIcon, HomeIcon } from "@heroicons/react/24/outline";

/**
 * The dead end.
 *
 * It replaces a shouting 8xl "HMM... PAGE NOT FOUND !" with something that does
 * the one job a 404 has: tell the user where they are and give them a way out.
 * The old screen offered no route anywhere — the only exit was the browser's
 * own back button, on a page that had just told them, in 96px letters, that
 * they were lost.
 *
 * (The old markup also used `w-screen`, i.e. `100vw`, which includes the
 * vertical scrollbar's width — so the 404 page pushed a horizontal scrollbar
 * onto the window in every desktop browser.)
 *
 * PUBLIC-ONLY. Its single call site is `[role].jsx`, in the branch where the
 * address names a role that does not exist — so the visitor is NOT signed in
 * and there is no shell around this. That is why it paints the public ground
 * itself rather than sitting on the portal's canvas: it is one of the five
 * signed-out pages, and it now looks like the other four. If it is ever reused
 * inside the portal, the `.pub-page` wrapper is the part to drop.
 */
function PageNotFound() {
    const router = useRouter();

    return (
        <div className="pub-page grid place-items-center px-4 py-12">
            <div className="pub-card w-full max-w-md p-7 text-center sm:p-8">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-teal-50 text-teal-700">
                    <MapIcon className="h-7 w-7" aria-hidden="true" />
                </span>
                <h1 className="pub-title mt-4 text-slate-900">
                    This page doesn’t exist
                </h1>
                <p className="pub-lede mt-3 text-slate-500">
                    The link may be out of date, or the page may have been renamed or
                    moved to a different menu.
                </p>
                <div className="mt-7 flex flex-col items-stretch justify-center gap-2 sm:flex-row">
                    <button type="button" onClick={() => router.back()}
                        className="pub-btn pub-btn-primary">
                        <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
                        Go back
                    </button>
                    <button type="button" onClick={() => router.push("/")}
                        className="pub-btn pub-btn-ghost">
                        <HomeIcon className="h-4 w-4" aria-hidden="true" />
                        Start over
                    </button>
                </div>
                <p className="pub-foot mt-7 text-slate-400">
                    Powered by Cent IT Solutions Pvt. Ltd.
                </p>
            </div>
        </div>
    )
}

export default PageNotFound;
