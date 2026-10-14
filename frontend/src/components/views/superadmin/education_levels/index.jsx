import { useEffect, useState } from "react";
import { Button } from "@material-tailwind/react";

import { useAppContext } from "@/contexts/AppContext";
import { Section, ButtonsSecion } from "@/components/sections";
import { SearchInput } from "@/components/inputs";
import Loader from "@/components/Loader";
import { fetchSchools } from "@/services/functions/schools";
import { options as EDUCATION_LEVELS } from "@/components/inputs/options/education";
import {
    getManagedHiddenLevels, setHiddenEducationLevels,
} from "@/services/functions/educationLevels";

function EducationLevelVisibility() {
    const { notification: { updateNotification } } = useAppContext();
    const [schools, setSchools] = useState([]);
    const [school, setSchool] = useState("");
    const [hidden, setHidden] = useState(new Set()); // hidden level ids
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        (async () => setSchools((await fetchSchools({}, true)) || []))();
    }, []);

    async function onSchool({ value }) {
        setSchool(value);
        if (!value) return setHidden(new Set());
        setLoading(true);
        const h = await getManagedHiddenLevels(value);
        setHidden(new Set(h));
        setLoading(false);
    }

    function toggle(levelId) {
        setHidden((prev) => {
            const next = new Set(prev);
            next.has(levelId) ? next.delete(levelId) : next.add(levelId);
            return next;
        });
    }

    async function onSave() {
        if (!school) return updateNotification("", "Pick a school first.");
        setSaving(true);
        const [status, message] = await setHiddenEducationLevels(school, Array.from(hidden));
        setSaving(false);
        if (status === 200) updateNotification(200, "Education levels updated!");
        else updateNotification(400, message || "Failed.");
    }

    return (
        <div className="flex flex-col gap-y-4">
            <Section title="Education Levels per School"
                description="By default every school sees every level. Uncheck a level to HIDE it for the selected school (its existing data stays intact — it's just removed from the pickers).">
                <SearchInput input={{ name: "school", label: "School", options: schools }} value={school} onChange={onSchool} />
            </Section>

            {!school ? null : loading ? <Loader /> : (
                <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {EDUCATION_LEVELS.map((lvl) => {
                            const isHidden = hidden.has(lvl.value);
                            return (
                                <button key={lvl.value} type="button" onClick={() => toggle(lvl.value)}
                                    className={`flex items-center gap-x-2 rounded-lg border-2 px-3 py-2.5 text-sm font-semibold capitalize transition-colors ${
                                        isHidden
                                            ? "border-gray-200 bg-gray-50 text-gray-400 line-through"
                                            : "border-teal-300 bg-teal-50 text-teal-800"
                                    }`}>
                                    <span className={`inline-flex w-4 h-4 items-center justify-center rounded border ${isHidden ? "border-gray-300" : "border-teal-500 bg-teal-500"}`}>
                                        {!isHidden && <span className="text-white text-[10px]">✓</span>}
                                    </span>
                                    {lvl.name}
                                </button>
                            );
                        })}
                    </div>
                    <p className="text-xs text-gray-500">Checked = visible to the school · unchecked = hidden. {hidden.size} hidden.</p>
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

export default EducationLevelVisibility;
