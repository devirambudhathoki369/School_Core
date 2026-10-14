import { useEffect, useState } from "react";
import { __fetch } from "@/services/functions";

const SMS_API = "/api/sms";
const POLL_MS = 12000;
// The provider's balance call takes 40-90 seconds, and after a send the server
// waits before asking it. Three minutes covers a full round.
const MAX_POLLS = 15;
const REVISIT_MS = 60000;
// While the page stays open and in view, look again this often. The server
// answers from its cache and only troubles the (slow) provider when its figure
// is more than a few minutes old, so this costs one light request.
const HEARTBEAT_MS = 180000;

// a real balance, as opposed to the "-" / "..." the server sends while it has none
export const creditIsReady = (v) =>
    typeof v === "number" ||
    (typeof v === "string" && !["", "-", "..."].includes(v.trim()));

/**
 * The school's SMS balance, and whether it can be trusted yet.
 *
 * The server answers at once from its cache and says so when that figure is not
 * the latest: `pending` (it has none yet) or `stale` (it is old, or the school
 * has sent messages since). This used to ask once and stop at the first number
 * it got — so after a bulk send the dashboard went on showing the balance from
 * before the send until someone reloaded the page. Now it keeps asking, quietly,
 * until the server has the provider's current figure, and asks again whenever
 * the tab comes back into view.
 *
 *   info      the server's answer (null until the first one)
 *   checking  true while a newer figure is still being fetched
 */
export function useSMSCredits(account, enabled = true) {
    const [info, setInfo] = useState(null);
    const [checking, setChecking] = useState(false);

    useEffect(() => {
        if (!enabled || !account) return undefined;
        let active = true;
        let timer;
        let polls = 0;
        let asked = 0;
        const load = async () => {
            clearTimeout(timer);
            asked = Date.now();
            const res = await __fetch(SMS_API, { user: account, include_credits: true });
            if (!active) return;
            polls += 1;
            const answer = res && !Array.isArray(res) ? res : null;
            const missing = !answer?.error && !creditIsReady(answer?.available_credit);
            const waiting = !!answer?.pending || !!answer?.stale || missing;
            if (waiting && polls < MAX_POLLS) {
                if (answer) setInfo(answer);
                setChecking(true);
                timer = setTimeout(load, POLL_MS);
                return;
            }
            setChecking(false);
            // never leave the figure stuck on "..."
            setInfo(missing || answer?.pending ? { available_credit: "-", error: "Balance unavailable, try again later" } : answer);
            // settled for now: keep the figure live for as long as it is looked at
            timer = setTimeout(() => {
                if (document.visibilityState === "visible") { polls = 0; load(); }
            }, HEARTBEAT_MS);
        };
        load();
        // coming back to the tab is a fresh look at the number
        const onVisible = () => {
            if (document.visibilityState === "visible" && Date.now() - asked > REVISIT_MS) {
                polls = 0;
                load();
            }
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            active = false;
            clearTimeout(timer);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [account, enabled]);

    return { info, checking };
}

/**
 * What to show for a balance: { value, note, estimated }.
 *
 * The figure is always the best one known right now: the provider's own when
 * it is current, and — when the school has sent messages since the provider
 * last answered — that figure less the credits our log recorded for them, so a
 * send shows in the balance at once instead of a minute later. The line under
 * it says only whether a newer figure is on its way; it carries no clock time.
 */
export function creditFacts(info, checking = false) {
    if (!info) return { value: "-", note: "Checking balance…", estimated: false };
    if (info.error) return { value: "-", note: "Balance unavailable", estimated: false };
    const estimated = typeof info.estimated_credit === "number";
    const value = estimated ? info.estimated_credit : (info.available_credit ?? "-");
    const sent = info.total_sms_sent != null ? `Total SMS sent: ${info.total_sms_sent}` : "Available balance";
    if (estimated || info.stale) return { value, note: checking ? "Updating…" : sent, estimated };
    return { value, note: sent, estimated: false };
}
