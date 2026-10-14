import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@material-tailwind/react";
import { ArrowDownTrayIcon, ServerStackIcon, BuildingOffice2Icon, CheckCircleIcon, InformationCircleIcon } from "@heroicons/react/24/outline";
import { Section } from "@/components/sections";
import { SearchInput } from "@/components/inputs";
import { downloadDatabaseBackup, getBackupSchools } from "@/services/functions/database_backup";
import styles from "./backup.module.css";

const SCOPES = [
    { value: "full", title: "Whole system", Icon: ServerStackIcon,
        text: "Every school, account and record, in one database file." },
    { value: "school", title: "One school", Icon: BuildingOffice2Icon,
        text: "Everything one school has, from every year, with its photos and documents." },
];
// What comes down, in the words of whoever will open the file. `true` marks
// what is inside it; the rest is what to know before relying on it.
const CONTENTS = {
    full: [
        [true, "The database", "One compressed file holding the whole database, with its structure."],
        [false, "Photos and documents", "Uploaded files are not in it. They are stored separately."],
    ],
    school: [
        [true, "The database", "database.sql holds every record of the school and restores straight into PostgreSQL. data.json is the same records for the system's own restore."],
        [true, "Photos and documents", "Every file the school's records point to, under media/."],
        [true, "Proof", "A count of every table and checksums of the data and of each file, with the steps to restore."],
        [false, "Nothing is left out", "Every year is included, and inactive records too. A file already missing from storage is listed, not hidden."],
        [false, "Other schools", "Records that belong to another school are listed, never exported. Restoring needs the same system version."],
    ],
};

export default function DatabaseBackup() {
    const [scope, setScope] = useState("full");
    const [schools, setSchools] = useState([]);
    const [school, setSchool] = useState("");
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);
    const downloading = useRef(false);

    async function loadSchools() {
        setLoading(true);
        setLoadError("");
        try {
            setSchools(await getBackupSchools());
        } catch (error) {
            setLoadError(error?.response?.data?.message || "Could not load schools. Please try again.");
        } finally {
            setLoading(false);
        }
    }
    useEffect(() => { loadSchools(); }, []);
    const options = useMemo(() => schools.map(s => ({
        value: s.id, name: `${s.name} (#${s.id})${s.is_active ? "" : " — inactive"}`,
    })), [schools]);
    const selected = schools.find(s => String(s.id) === String(school));

    async function download() {
        if (downloading.current || (scope === "school" && !selected)) return;
        downloading.current = true;
        setBusy(true);
        setResult(null);
        try {
            const [status, message] = await downloadDatabaseBackup(scope, school);
            setResult({ ok: status === 200, message });
        } finally {
            downloading.current = false;
            setBusy(false);
        }
    }

    return (
        <Section grid={false} title="Database Backup" description="Download a copy of the whole system, or of everything one school has.">
            {/* `app-pin-pickers`: the school list opens low in the window and
                must not be able to push the page out of it. */}
            <div className={`${styles.page} app-pin-pickers`}>
                <div className={styles.form}>
                    <fieldset disabled={busy} className={styles.step} aria-labelledby="backup-scope">
                        <h3 id="backup-scope">What to back up</h3>
                        <div className={styles.choices}>
                            {SCOPES.map(({ value, title, Icon, text }) => (
                                <label key={value} className={styles.choice} data-on={scope === value}>
                                    <input type="radio" name="backup-scope" value={value} checked={scope === value}
                                        onChange={() => { setScope(value); setResult(null); }} />
                                    <span className={styles.choiceIcon}><Icon /></span>
                                    <span><strong>{title}</strong><em>{text}</em></span>
                                </label>
                            ))}
                        </div>
                    </fieldset>
                    {scope === "school" && (
                        <fieldset disabled={busy} className={styles.step}>
                            {loading ? <p role="status" className={styles.quiet}>Loading schools…</p> : loadError ? (
                                <div role="alert" className={styles.failed}>
                                    <span>{loadError}</span>
                                    <button type="button" onClick={loadSchools}>Try again</button>
                                </div>
                            ) : schools.length === 0 ? <p className={styles.quiet}>No schools are available.</p> : (
                                <div className={styles.field}>
                                    <SearchInput input={{ name: "school", label: "School", options }}
                                        value={school} onChange={({ value }) => { if (!busy) { setSchool(value); setResult(null); } }} />
                                </div>
                            )}
                        </fieldset>
                    )}
                    <div className={styles.actions}>
                        <Button color="teal" onClick={download} disabled={busy || (scope === "school" && (loading || !!loadError || !selected))}
                            className="flex items-center gap-2 normal-case">
                            <ArrowDownTrayIcon className="h-5 w-5" />
                            {busy ? "Preparing backup…" : scope === "full" ? "Download whole-system backup" : "Download school backup"}
                        </Button>
                        <p className={styles.quiet} role={busy ? "status" : undefined}>
                            {busy ? "Preparing your download. A large backup can take several minutes. Keep this page open."
                                : scope === "school" && !selected ? "Choose a school to download its backup."
                                    : "The file is prepared on the server, then downloaded here."}
                        </p>
                    </div>
                    {result && <p role={result.ok ? "status" : "alert"} className={styles.result} data-ok={result.ok}>{result.message}</p>}
                </div>
                <aside className={styles.about} aria-labelledby="backup-contents">
                    <h3 id="backup-contents">{scope === "full" ? "What the whole-system backup holds" : "What a school backup holds"}</h3>
                    <ul>
                        {CONTENTS[scope].map(([inside, title, text]) => (
                            <li key={title}>
                                {inside ? <CheckCircleIcon aria-hidden="true" /> : <InformationCircleIcon aria-hidden="true" />}
                                <span><b>{title}.</b> {text}</span>
                            </li>
                        ))}
                    </ul>
                </aside>
            </div>
        </Section>
    );
}
