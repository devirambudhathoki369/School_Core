import { useEffect, useMemo, useState } from "react";
import { Button } from "@material-tailwind/react";

import { useAppContext } from "@/contexts/AppContext";
import { Section, ButtonsSecion } from "@/components/sections";
import { SearchInput } from "@/components/inputs";
import Loader from "@/components/Loader";
import { getAllUiThemes, saveUiTheme } from "@/services/functions/uiThemes";
import { UI_THEMES, UI_THEME_CLASSIC, safeTheme } from "@/configs/uiThemes";

/**
 * Which interface theme a school's screens are drawn in.
 *
 * Colour only — a theme never changes what a page shows, filters or totals, and
 * printed bills and marksheets are identical on every theme. `Classic` is the
 * look every school has today and is what an untouched school stays on, so this
 * page can only ever move a school somewhere on purpose.
 */
function InterfaceTheme() {
    const { notification: { updateNotification } } = useAppContext();
    const [schools, setSchools] = useState([]);
    const [school, setSchool] = useState("");
    const [theme, setTheme] = useState(UI_THEME_CLASSIC);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        (async () => {
            const { schools } = await getAllUiThemes();
            setSchools(schools);
            setLoading(false);
        })();
    }, []);

    // The picker wants {value,name}; the payload carries the theme alongside so
    // selecting a school can show its current one without another request.
    const options = useMemo(
        () => schools.map((s) => ({ value: s.id, name: s.name })),
        [schools]
    );

    function onSchool({ value }) {
        setSchool(value);
        const picked = schools.find((s) => String(s.id) === String(value));
        setTheme(safeTheme(picked?.ui_theme));
    }

    async function onSave() {
        if (!school) return updateNotification("", "Pick a school first.");
        setSaving(true);
        const [status, message] = await saveUiTheme(school, theme);
        setSaving(false);
        if (status === 200) {
            // Keep the local list in step so re-picking the school shows what
            // was just saved rather than the value the page loaded with.
            setSchools((prev) => prev.map((s) =>
                String(s.id) === String(school) ? { ...s, ui_theme: theme } : s
            ));
            updateNotification(200, "Interface theme updated! The school sees it on their next sign-in.");
        } else {
            updateNotification(400, message || "Failed.");
        }
    }

    const current = schools.find((s) => String(s.id) === String(school));

    return (
        <div className="flex flex-col gap-y-4">
            {/* The "this console" picker that used to sit here is gone. The
                console has a permanent palette of its own now — graphite rail,
                indigo accent, defined as `[data-ui-theme="console"]` — so this
                page is only about the schools. A console that looks like one of
                the school themes is a console you can mistake for a school. */}
            <Section title="Interface Theme per School"
                description="The colours a school's screens are drawn in. Presentation only — no page changes what it shows, and printed bills, vouchers and marksheets look identical on every theme. Classic is the look every school has today; a school stays on it until it is moved here.">
                {loading ? <Loader /> : (
                    <SearchInput input={{ name: "school", label: "School", options }}
                        value={school} onChange={onSchool} />
                )}
            </Section>

            {!school ? null : (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {UI_THEMES.map((t) => {
                            const selected = t.value === theme;
                            const live = safeTheme(current?.ui_theme) === t.value;
                            return (
                                <button key={t.value} type="button" onClick={() => setTheme(t.value)}
                                    className={`text-left rounded-lg border-2 p-3 transition-colors ${
                                        selected ? "border-teal-500 bg-teal-50" : "border-gray-200 bg-white hover:border-gray-300"
                                    }`}>
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="font-semibold text-gray-900">{t.name}</span>
                                        {live && <span className="text-[10px] font-semibold uppercase text-teal-700">in use</span>}
                                    </div>
                                    {/* A swatch row plus the rail colour: enough to
                                        recognise a theme without rendering the app. */}
                                    <div className="mt-2 flex overflow-hidden rounded border border-gray-200">
                                        <span className="h-6 w-6 shrink-0" style={{ background: t.rail }} />
                                        {t.swatches.map((c, i) => (
                                            <span key={i} className="h-6 flex-1" style={{ background: c }} />
                                        ))}
                                    </div>
                                    <p className="mt-2 text-xs text-gray-500">{t.blurb}</p>
                                </button>
                            );
                        })}
                    </div>

                    <ButtonsSecion>
                        <Button color="teal" disabled={saving} onClick={onSave}
                            className="rounded-lg normal-case font-semibold shadow-sm">
                            {saving ? "Saving…" : "Save"}
                        </Button>
                    </ButtonsSecion>
                </>
            )}
        </div>
    );
}

export default InterfaceTheme;
