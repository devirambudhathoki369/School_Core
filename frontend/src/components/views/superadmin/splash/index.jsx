import { confirmAction } from "@/components/ConfirmDialog";
import { useEffect, useRef, useState } from "react";
import { Button, Textarea } from "@material-tailwind/react";
import { TrashIcon, CheckCircleIcon } from "@heroicons/react/24/outline";

import { useAppContext } from "@/contexts/AppContext";
import { Section, ButtonsSecion } from "@/components/sections";
import { TextInput } from "@/components/inputs";
import Loader from "@/components/Loader";
import NotFound from "@/components/NotFound";
import {
    getSplashNotices, saveSplashNotice, deleteSplashNotice,
} from "@/services/functions/splash";

const blank = () => ({ title: "", message: "", is_active: true, image: null, preview: "" });

function SplashManagement() {
    const { notification: { updateNotification } } = useAppContext();
    const [form, setForm] = useState(blank());
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const fileRef = useRef(null);

    async function load() {
        setLoading(true);
        const data = await getSplashNotices();
        setRows(Array.isArray(data) ? data : []);
        setLoading(false);
    }
    useEffect(() => { load(); }, []);

    function onChange({ name, value }) { setForm((s) => ({ ...s, [name]: value })); }
    function onPickImage(e) {
        const file = e.target.files?.[0];
        if (file) setForm((s) => ({ ...s, image: file, preview: URL.createObjectURL(file) }));
    }

    async function onSave(e) {
        e.preventDefault();
        if (!form.title && !form.message && !form.image) {
            return updateNotification("", "Add a title, message, or image.");
        }
        setSaving(true);
        const [status, message] = await saveSplashNotice(form);
        setSaving(false);
        if (status === 200) {
            updateNotification(200, "Splash saved!");
            setForm(blank());
            if (fileRef.current) fileRef.current.value = "";
            load();
        } else updateNotification(400, message || "Failed.");
    }

    async function onToggle(row) {
        const [status, message] = await saveSplashNotice({ id: row.id, is_active: !row.is_active });
        if (status === 200) load(); else updateNotification(400, message || "Failed.");
    }
    async function onDelete(id) {
        if (!await confirmAction({
            title: "Delete this splash notice?",
            body: "It stops appearing in the app immediately for every school it targets.",
        })) return;
        const [status, message] = await deleteSplashNotice(id);
        if (status === 200) load(); else updateNotification(400, message || "Failed.");
    }

    return (
        <div className="flex flex-col gap-y-4">
            <form onSubmit={onSave}>
                <Section title="Add Splash" description="Shown to every school user at login — auto-closes after a few seconds, with a close button.">
                    <TextInput input={{ name: "title", label: "Title (optional)" }} value={form.title} onChange={onChange} />
                    <div className="sm:col-span-4">
                        <label className="text-sm font-medium text-gray-900">Image (optional)</label>
                        <input ref={fileRef} type="file" accept="image/*" onChange={onPickImage}
                            className="mt-1 block w-full text-sm border border-blue-gray-200 rounded-lg p-1.5" />
                    </div>
                    <div className="sm:col-span-8">
                        <Textarea label="Message (optional)" value={form.message}
                            onChange={(e) => onChange({ name: "message", value: e.target.value })} />
                    </div>
                    <label className="sm:col-span-4 flex items-center gap-x-2 text-sm">
                        <input type="checkbox" checked={form.is_active}
                            onChange={(e) => onChange({ name: "is_active", value: e.target.checked })} />
                        Active (show to users now)
                    </label>
                    {form.preview && (
                        <div className="sm:col-span-4">
                            <img src={form.preview} alt="preview" className="max-h-32 rounded-lg border" />
                        </div>
                    )}
                </Section>
                <ButtonsSecion>
                    <Button type="submit" color="teal" disabled={saving}
                        className="rounded-lg normal-case font-semibold shadow-sm">
                        {saving ? "Saving…" : "Save Splash"}
                    </Button>
                </ButtonsSecion>
            </form>

            {loading ? <Loader /> : rows.length === 0 ? <NotFound error="No splash notices yet." /> : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {rows.map((r) => (
                        <div key={r.id} className={`rounded-xl border p-3 shadow-sm ${r.is_active ? "border-teal-300 bg-teal-50/40" : "border-gray-200 bg-white"}`}>
                            <div className="flex items-start justify-between gap-2">
                                <span className={`text-[11px] font-bold uppercase ${r.is_active ? "text-teal-700" : "text-gray-400"}`}>
                                    {r.is_active ? "Active" : "Inactive"}
                                </span>
                                <div className="flex items-center gap-x-1">
                                    <button type="button" onClick={() => onToggle(r)} title={r.is_active ? "Deactivate" : "Activate"}
                                        className={`p-1.5 rounded ${r.is_active ? "bg-gray-100 text-gray-600" : "bg-teal-100 text-teal-700"}`}>
                                        <CheckCircleIcon className="w-4 h-4" />
                                    </button>
                                    <button type="button" onClick={() => onDelete(r.id)} className="p-1.5 rounded bg-rose-50 text-rose-600">
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            {r.image && <img src={r.image} alt={r.title || ""} className="w-full max-h-40 object-contain rounded-lg bg-gray-50 my-2" />}
                            {r.title && <div className="font-bold text-gray-800">{r.title}</div>}
                            {r.message && <div className="text-sm text-gray-600 whitespace-pre-wrap">{r.message}</div>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default SplashManagement;
