import { useEffect, useState } from "react";
import { __fetch } from "@/services/functions";

/**
 * The code a Digital ID link carries, as `&c=...` to add to the link, or "" until
 * it arrives. A page of ID cards asks for hundreds at once, so requests made in
 * the same moment travel together.
 */
const known = new Map();
const waiting = new Map();
const MAX_IDS = 500;
let timer = null;

async function flush() {
    timer = null;
    const batches = [...waiting.entries()];
    waiting.clear();
    for (const [group, people] of batches) {
        const [school, role] = group.split(":");
        const ids = [...people.keys()];
        for (let start = 0; start < ids.length; start += MAX_IDS) {
            const part = ids.slice(start, start + MAX_IDS);
            const codes = await __fetch("/api/digital_id_codes", { school, role, ids: part.join(",") });
            part.forEach((id) => {
                const code = codes?.[id] || "";
                if (code) known.set(`${group}:${id}`, code);
                people.get(id).forEach((done) => done(code));
            });
        }
    }
}

function ask(school, role, id) {
    return new Promise((done) => {
        const group = `${school}:${role}`;
        if (!waiting.has(group)) waiting.set(group, new Map());
        const people = waiting.get(group);
        people.set(id, [...(people.get(id) || []), done]);
        timer = timer || setTimeout(flush, 30);
    });
}

export default function useDigitalIdCode(school, id, role = 1) {
    const key = `${school}:${role}:${id}`;
    const [code, setCode] = useState(known.get(key) || "");
    useEffect(() => {
        if (!school || !id) return;
        if (known.has(key)) return setCode(known.get(key));
        let current = true;
        ask(school, role, id).then((answer) => current && setCode(answer));
        return () => { current = false; };
    }, [key]);
    return code ? `&c=${code}` : "";
}
