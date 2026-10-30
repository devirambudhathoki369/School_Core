import { useEffect, useState } from "react";
import { Button } from "@material-tailwind/react";

import { SelectInput, TextInput } from "@/components/inputs";
import Checkbox from "@/components/inputs/Checkbox";
import Loader from "@/components/Loader";
import { ButtonsSecion, Section } from "@/components/sections";
import { SLIP_WIDTHS } from "@/configs/canteen";
import { saveCanteenSettings } from "@/services/functions/canteen";
import { useCanteenScope, useOnce } from "../common";

const formOf = (s) => ({
    allow_cash: s.allow_cash !== false,
    allow_account: s.allow_account !== false,
    credit_limit: `${Number(s.credit_limit || 0)}`,
    daily_limit: `${Number(s.daily_limit || 0)}`,
    low_balance: `${Number(s.low_balance || 0)}`,
    notify_parents: s.notify_parents !== false,
    slip_width: Number(s.slip_width ?? 80),
    slip_footer: s.slip_footer || "",
});

/**
 * THE CANTEEN'S RULES, set once by the office.
 *
 * The defaults let a school sell the day the module is switched on: cash and
 * card accounts both allowed, accounts prepaid only (no credit), no daily
 * limit, families told about every purchase.
 */
function CanteenSetup() {
    const { school, settings, reloadSettings, updateNotification } = useCanteenScope();
    const [form, setForm] = useState(null);
    const [busy, once] = useOnce();

    useEffect(() => { if (settings) setForm(formOf(settings)); }, [settings]);

    function set(name, value) {
        setForm((s) => ({ ...s, [name]: value }));
    }

    async function onSave(e) {
        e.preventDefault();
        if (!form.allow_cash && !form.allow_account) {
            return updateNotification("", "Allow at least one way to pay — cash or the canteen account.");
        }
        await once(async () => {
            const [status, message] = await saveCanteenSettings({
                school, ...form,
                slip_width: Number(form.slip_width),
                credit_limit: Number(form.credit_limit || 0), daily_limit: Number(form.daily_limit || 0),
                low_balance: Number(form.low_balance || 0),
            });
            updateNotification(status === 200 ? 200 : 400, message || (status === 200 ? "Saved!" : "Failed."));
            if (status === 200) reloadSettings();
        });
    }

    if (!form) return <Loader />;

    return (
        <form onSubmit={onSave} className="flex flex-col gap-y-2">
            <Section title="How buyers pay"
                description={"Cash at the counter, the buyer's canteen account, or both. Walk-in customers always pay cash.\n"
                    + "Monthly postings and dues are collected in Collect & Receipt either way."}>
                <Checkbox name="allow_cash" text="Cash at the counter" checked={form.allow_cash}
                    onClick={() => set("allow_cash", !form.allow_cash)} />
                <Checkbox name="allow_account" text="Canteen account (card)" checked={form.allow_account}
                    onClick={() => set("allow_account", !form.allow_account)} />
            </Section>

            <Section title="Account limits (school default)"
                description={"Every account follows these unless it has its own (Card Accounts > View).\n"
                    + "Credit 0 = prepaid only: nothing can be bought that has not been paid in. Daily limit 0 = no limit."}>
                <TextInput input={{ name: "credit_limit", label: "Credit allowed (Rs.)", type: "number" }} value={form.credit_limit}
                    onChange={({ value }) => set("credit_limit", value)}
                    info="How far below zero an account may go. The due is collected in Collect & Receipt." />
                <TextInput input={{ name: "daily_limit", label: "Daily spending limit (Rs.)", type: "number" }} value={form.daily_limit}
                    onChange={({ value }) => set("daily_limit", value)} />
                <TextInput input={{ name: "low_balance", label: "\"Running low\" below (Rs.)", type: "number" }} value={form.low_balance}
                    onChange={({ value }) => set("low_balance", value)} info="The family's purchase message says so below this." />
            </Section>

            <Section title="Telling families"
                description="An app message (stored in the app's inbox) when their child's account is spent, topped up, refunded or posted for the month.">
                <Checkbox name="notify_parents" text="Send app messages" checked={form.notify_parents}
                    onClick={() => set("notify_parents", !form.notify_parents)} />
            </Section>

            <Section title="Counter slip" description="The printer at the counter, and a line printed at the foot of every slip.">
                <SelectInput input={{ name: "slip_width", label: "Printer", options: SLIP_WIDTHS }} value={form.slip_width}
                    onChange={({ value }) => set("slip_width", value)} />
                <TextInput grid={8} input={{ name: "slip_footer", label: "Slip footer", placeholder: "e.g. Thank you! Eat well." }}
                    value={form.slip_footer} onChange={({ value }) => set("slip_footer", value)} />
            </Section>

            <ButtonsSecion>
                <Button type="submit" color="teal" disabled={busy}>{busy ? "Saving…" : "Save canteen settings"}</Button>
            </ButtonsSecion>
        </form>
    );
}

export default CanteenSetup;
