import Support from "@/components/views/support";

/**
 * The standalone /support route (reachable without signing in).
 *
 * The page itself is a stack of cards that grows past the fold, so the shell
 * only has to give it a scrolling column and a gutter — the old
 * `h-screen … overflow-hidden` clipped everything below the first screen.
 */
export default () => (
    <div className="min-h-screen w-full overflow-y-auto px-3 py-5 sm:px-6 sm:py-8">
        <Support />
    </div>
);
