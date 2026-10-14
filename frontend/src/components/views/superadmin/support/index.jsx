import { useEffect, useState } from "react";
import { Button, Textarea } from "@material-tailwind/react";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";

import { useAppContext } from "@/contexts/AppContext";
import { Section, ButtonsSecion } from "@/components/sections";
import { TextInput, SelectInput } from "@/components/inputs";
import Loader from "@/components/Loader";
import { getSupportInfo, updateSupportInfo } from "@/services/functions/help";

/**
 * Support details (superadmin).
 *
 * What the Support page prints — the phone number, the office address, the
 * hours, and the "help us fix it faster" checklist — used to be a constant in
 * the frontend bundle, so correcting a typo in a phone number needed a deploy.
 * It is one row now, edited here.
 *
 * Weekdays are stored the way Python counts them (Monday 0 … Sunday 6) because
 * that is what the backend and any future cron would use; `getDay()` in the
 * browser counts from Sunday, so the two Support pages convert rather than
 * store a second field.
 */

const HOURS = Array.from({ length: 25 }, (_, h) => ({
    name: h === 24 ? "24:00" : `${String(h).padStart(2, "0")}:00`,
    value: h,
}));

// Monday-first, matching the stored numbering.
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const blank = () => ({
    name: "",
    product: "",
    address: "",
    open_days: "",
    open_time: "",
    open_from_hour: 9,
    open_to_hour: 17,
    closed_weekdays: [5],
    contact: "",
    email: "",
    website: "",
    whatsapp_contact: "",
    fb_page_id: "",
    checklist: [],
});

function SupportDetails() {
    const { notification: { updateNotification } } = useAppContext();
    const [form, setForm] = useState(blank());
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        (async () => {
            const data = await getSupportInfo();
            if (data) setForm({ ...blank(), ...data });
            setLoading(false);
        })();
    }, []);

    function onChange({ name, value }) {
        setForm((s) => ({ ...s, [name]: value }));
    }

    function toggleDay(day) {
        setForm((s) => {
            const days = s.closed_weekdays || [];
            return {
                ...s,
                closed_weekdays: days.includes(day)
                    ? days.filter((d) => d !== day)
                    : [...days, day].sort((a, b) => a - b),
            };
        });
    }

    async function onSave(e) {
        e.preventDefault();
        if (!form.name?.trim()) {
            return updateNotification(400, "The company name cannot be blank.");
        }
        if (Number(form.open_to_hour) <= Number(form.open_from_hour)) {
            return updateNotification(400, "Closing time must be after opening time.");
        }
        setSaving(true);
        const [status, message] = await updateSupportInfo({
            ...form,
            open_from_hour: Number(form.open_from_hour),
            open_to_hour: Number(form.open_to_hour),
        });
        setSaving(false);
        updateNotification(status, status === 200 ? "Support details updated!" : (message || "Failed."));
    }

    if (loading) return <Loader />;

    const checklistText = Array.isArray(form.checklist)
        ? form.checklist.join("\n")
        : (form.checklist || "");

    return (
        <form onSubmit={onSave} className="w-full">
            <Section title="Who we are"
                description="Printed at the top of the Support page, and on the signed-out /support route.">
                <TextInput grid={6} input={{ name: "name", label: "Company name", required: true }}
                    value={form.name} onChange={onChange} />
                <TextInput grid={6} input={{ name: "product", label: "Product line" }}
                    value={form.product} onChange={onChange} />
                <TextInput grid={12} input={{ name: "address", label: "Office address" }}
                    value={form.address} onChange={onChange} />
            </Section>

            <Section title="Office hours"
                description="The 'we're online now' badge on the Support page is driven by these, so they are the hours people are told you answer.">
                <TextInput grid={6} input={{ name: "open_days", label: "Open on (as printed)", placeholder: "Sunday – Friday" }}
                    value={form.open_days} onChange={onChange} />
                <TextInput grid={6} input={{ name: "open_time", label: "Hours (as printed)", placeholder: "9:00 AM – 5:00 PM" }}
                    value={form.open_time} onChange={onChange} />
                <SelectInput grid={3} input={{ name: "open_from_hour", label: "Open from", options: HOURS }}
                    value={form.open_from_hour} onChange={onChange} />
                <SelectInput grid={3} input={{ name: "open_to_hour", label: "Open until", options: HOURS }}
                    value={form.open_to_hour} onChange={onChange} />

                <div className="sm:col-span-6">
                    <label className="app-field-label text-sm font-medium leading-6 text-gray-900">
                        Closed on
                    </label>
                    <div className="mt-1 flex flex-wrap gap-2">
                        {WEEKDAYS.map((label, day) => {
                            const off = (form.closed_weekdays || []).includes(day);
                            return (
                                <button key={label} type="button" onClick={() => toggleDay(day)}
                                    aria-pressed={off}
                                    data-selected={off ? "true" : undefined}
                                    className={`app-filter-chip rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors
                                        ${off
                                            ? "border-transparent bg-teal-500 text-white"
                                            : "border-blue-gray-200 bg-white text-gray-600 hover:border-blue-gray-300"}`}>
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </Section>

            <Section title="How to reach us"
                description="Each of these becomes a tappable card on the Support page. Leave one blank to hide its card.">
                <TextInput grid={4} input={{ name: "contact", label: "Phone number" }}
                    value={form.contact} onChange={onChange} />
                <TextInput grid={4} input={{ name: "email", label: "Email", type: "email" }}
                    value={form.email} onChange={onChange} />
                <TextInput grid={4} input={{ name: "website", label: "Website" }}
                    value={form.website} onChange={onChange} />
                <TextInput grid={8}
                    input={{ name: "whatsapp_contact", label: "WhatsApp link", placeholder: "https://wa.me/98…?text=…" }}
                    value={form.whatsapp_contact} onChange={onChange} />
                <TextInput grid={4}
                    input={{ name: "fb_page_id", label: "Facebook page ID", mask: false }}
                    value={form.fb_page_id} onChange={onChange} />
            </Section>

            <Section title="Help us fix it faster" grid={false}
                description="The checklist of what a school should send with a problem report. One line per item.">
                <Textarea label="Checklist — one item per line" rows={5} value={checklistText}
                    onChange={({ target: { value } }) => onChange({ name: "checklist", value: value.split("\n") })} />
            </Section>

            <ButtonsSecion>
                <a href="/support" target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-blue-gray-200
                               px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                    Preview the page
                    <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                </a>
                <Button type="submit" color="teal" disabled={saving} loading={saving}>
                    {saving ? "Saving" : "Save details"}
                </Button>
            </ButtonsSecion>
        </form>
    );
}

export default SupportDetails;
