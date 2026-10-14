import cleanEmptyFields from "@/methods/cleanEmptyFields";
import server from "../server";
import axios from "axios";
import { confirmAction } from "@/components/ConfirmDialog";

function __success_res(res) {
    return [res?.status || 200,
    res.data?.message || res?.detail,
    res.data];
}
function __failed_res(err, status = 400) {
    return [status,
        err?.response?.data?.message || err?.response?.data?.detail ||
        err.message || err.detail,
        null];
}

export async function __fetch(path, params, headers) {
    try {
        const res = await server.get(path, { params, headers });
        if (res.status === 200) {
            return res.data;
        }
    } catch (e) {
        return e?.response?.data || [];
    }
}

export async function __search(path, params) {
    try {
        const res = await server.post(path, cleanEmptyFields(params));
        if (res.status === 200) {
            return __success_res(res);
        }
    } catch (e) {
        return __failed_res(e);
    }
}

export async function __fetchAsOptions(path, params, mappings, headers) {
    // default: fetch as options i.e. in format [{name, value}, ...];
    try {
        const res = await server.get(path, { params, headers });
        if (res.status === 200) {
            const data = res.data.reduce((acc, val) => {
                acc.push({ name: val?.[mappings['name']], value: val.id });
                return acc;
            }, []);
            // console.log('index.js', data);
            return data;
        }
    } catch (e) {
        // console.log(e.message);
        return [];
    }
}

// A failed sign-in is a failed save too, so its body — username AND password —
// was being forwarded verbatim to the issues store. Credentials never leave.
const SECRET_KEY_PATTERN = /pass(word)?|otp|token|secret|sms_api/i;

function redactRequestData(url, data) {
    if (url.includes("/auth/")) return "[redacted]";
    if (typeof data !== "string") return data;
    try {
        const parsed = JSON.parse(data);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            for (const key of Object.keys(parsed)) {
                if (SECRET_KEY_PATTERN.test(key)) parsed[key] = "[redacted]";
            }
            return JSON.stringify(parsed);
        }
    } catch (error) { }
    return data;
}

async function forwardToIssues(e, timestamp) {
    // No server response (network error / CORS block / timeout / backend
    // unreachable) means there's nothing to forward — and destructuring the
    // missing `e.response` here would THROW and mask the real error from the
    // caller (e.g. login showing "Cannot destructure property 'status'...").
    const resp = e?.response;
    if (!resp) return;
    const { status, data: error, config } = resp;
    const url = config?.url || "";
    const requestData = redactRequestData(url, config?.data);
    // console.log(timestamp, url, status, error, requestData);
    const key = `${url.split('/').join('__')}::${timestamp}`;
    const payload = { date: new Date(timestamp), status, error, requestData };
    try {
        await axios.post("/api/issues", { key, payload }, false);
    } catch (error) { }
}

const MAX_SIZE = 1048576; // 1 MB;

/**
 * POSTs that are currently in flight, keyed by path + payload.
 *
 * THE DUPLICATE-RECORDS FIX. Save buttons across this app do not reliably block
 * a second click — `FormSaveButton` disables itself only when the caller
 * remembers to pass `saving`, many forms submit on Enter, and a slow connection
 * leaves a long window where the button still looks live. The result has been
 * genuine duplicate rows in production.
 *
 * Guarding every button is 146 files and is still only as good as the next form
 * someone writes. This is the one place every POST in the app passes through,
 * so the guarantee is made once and cannot be forgotten: while an identical
 * request is outstanding, a second one returns THE SAME promise instead of
 * issuing a second POST. Both callers get the same result, so nothing upstream
 * has to change and no `await` is left hanging.
 *
 * Deliberately keyed on the payload as well as the path, and cleared the moment
 * the request settles:
 *   · a save with DIFFERENT data is a different intent and always goes through;
 *   · saving the same thing again AFTER the first finished is a real second
 *     save (a correction, a re-submit) and also goes through.
 * Only the physically-impossible case — the same record submitted twice before
 * the first answer came back — is collapsed.
 *
 * Completely invisible: no markup, no styling, nothing that renders. It applies
 * on Classic and on every theme, because a duplicate record is not a matter of
 * appearance.
 */
const inFlight = new Map();

export async function __save(path, data, clean = true) {
    const timestamp = Date.now();
    if (clean) data = cleanEmptyFields(data);
    // 
    const size = new Blob([JSON.stringify(data || {})]).size;
    if (size > MAX_SIZE) return [400, `Data size exceeded!`, null];
    // 
    // FormData (file uploads) does not serialise to a stable string, so it
    // cannot be keyed — and an upload is never the duplicate-click case anyway.
    // Those bypass the guard entirely rather than being keyed wrongly.
    const keyable = typeof FormData === "undefined" || !(data instanceof FormData);
    const key = keyable ? `${path}::${JSON.stringify(data ?? null)}` : null;
    if (key && inFlight.has(key)) return inFlight.get(key);

    const request = (async () => {
        try {
            const res = await server.post(path, data); // server is an axios instance
            return __success_res(res);
        } catch (e) {
            if (process.env.NODE_ENV === "production") {
                // reporting must never break the real error path
                try { await forwardToIssues(e, timestamp); } catch (_) { }
            }
            return __failed_res(e);
        } finally {
            if (key) inFlight.delete(key);
        }
    })();

    if (key) inFlight.set(key, request);
    return request;
}

export async function __update(path, data, clean = true) {
    if (clean) data = cleanEmptyFields(data);
    try {
        const res = await server.put(path, data);
        return __success_res(res);
    } catch (e) {
        return __failed_res(e);
    }
}

export async function __delete(path, params, headers) {
    // Was a bare `confirm("Do you want to delete?")` — a native browser dialog
    // asking a question that names neither the record nor the consequence, on
    // the one action that cannot be undone. Routed through the same helper as
    // the other eighteen destructive actions, which every school now gets.
    if (await confirmAction({
        title: "Delete this record?",
        body: "This cannot be undone. If the record is referenced anywhere else, the server will refuse and keep it.",
    })) {
        try {
            const res = await server.delete(path, { params, headers });
            return __success_res(res);
        } catch (e) {
            return __failed_res(e);
        }
    } else return [];
}