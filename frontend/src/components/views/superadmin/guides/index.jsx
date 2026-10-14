import { useEffect, useMemo, useState } from "react";
import { Button, Textarea } from "@material-tailwind/react";
import {
    PencilSquareIcon,
    TrashIcon,
    PlusIcon,
    EyeIcon,
    EyeSlashIcon,
} from "@heroicons/react/24/outline";

import { useAppContext } from "@/contexts/AppContext";
import { Section, ButtonsSecion } from "@/components/sections";
import { TextInput, SelectInput } from "@/components/inputs";
import Loader from "@/components/Loader";
import {
    getGuides, saveGuide, deleteGuide,
    saveGuideCategory, deleteGuideCategory,
} from "@/services/functions/help";

/**
 * Guides (superadmin).
 *
 * Two editors on one page, because they are two halves of the same job: the
 * category chips the Guides page filters by, and the guides themselves. Steps
 * and tips are edited as one-per-line text — the API accepts that shape as well
 * as a JSON array, so the console never has to hand-write brackets.
 *
 * Unpublishing (`is_active`) rather than deleting is the intended way to retire
 * a guide: the readers' endpoint filters inactive rows out, but the text is
 * still here if it turns out the feature only moved.
 */

const blankGuide = () => ({
    id: null,
    slug: "",
    category: "",
    title: "",
    summary: "",
    where: "",
    view: "",
    steps: "",
    tips: "",
    order: 0,
    is_active: true,
});

const blankCategory = () => ({ id: null, key: "", name: "", order: 0, is_active: true });

const asText = (value) => (Array.isArray(value) ? value.join("\n") : (value || ""));

function Guides() {
    const { notification: { updateNotification } } = useAppContext();
    const [categories, setCategories] = useState([]);
    const [guides, setGuides] = useState([]);
    const [guide, setGuide] = useState(blankGuide());
    const [category, setCategory] = useState(blankCategory());
    const [filter, setFilter] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savingCategory, setSavingCategory] = useState(false);

    async function load() {
        const data = await getGuides({ manage: true });
        setCategories(data?.categories || []);
        setGuides(data?.guides || []);
        setLoading(false);
    }
    useEffect(() => { load(); }, []);

    const categoryOptions = useMemo(
        () => categories.map((c) => ({ name: c.name, value: c.key })),
        [categories]
    );
    const categoryName = useMemo(
        () => categories.reduce((acc, c) => ({ ...acc, [c.key]: c.name }), {}),
        [categories]
    );

    const visible = useMemo(
        () => (filter ? guides.filter((g) => g.category === filter) : guides),
        [guides, filter]
    );

    // ── guides ───────────────────────────────────────────────────────────
    function onGuideChange({ name, value }) {
        setGuide((s) => ({ ...s, [name]: value }));
    }

    function editGuide(row) {
        setGuide({
            ...row,
            steps: asText(row.steps),
            tips: asText(row.tips),
        });
        // The form is above the list, and on a phone the list is long enough
        // that an edit would otherwise change nothing you can see.
        if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    }

    async function onSaveGuide(e) {
        e.preventDefault();
        if (!guide.title?.trim()) return updateNotification(400, "A guide needs a title.");
        if (!guide.category) return updateNotification(400, "Pick a category for this guide.");
        setSaving(true);
        const [status, message] = await saveGuide({
            ...guide,
            order: Number(guide.order) || 0,
            // one line per step / tip
            steps: asText(guide.steps).split("\n"),
            tips: asText(guide.tips).split("\n"),
        });
        setSaving(false);
        if (status === 200) {
            updateNotification(200, guide.id ? "Guide updated!" : "Guide saved!");
            setGuide(blankGuide());
            load();
        } else updateNotification(status || 400, message || "Failed.");
    }

    async function onToggleGuide(row) {
        const [status, message] = await saveGuide({ id: row.id, is_active: !row.is_active });
        if (status === 200) load();
        else updateNotification(status || 400, message || "Failed.");
    }

    async function onDeleteGuide(row) {
        const [status, message] = await deleteGuide(row.id);
        if (!status) return; // the shared delete helper was cancelled
        if (status === 200) {
            updateNotification(200, "Guide deleted!");
            if (guide.id === row.id) setGuide(blankGuide());
            load();
        } else updateNotification(status, message || "Failed.");
    }

    // ── categories ───────────────────────────────────────────────────────
    function onCategoryChange({ name, value }) {
        setCategory((s) => ({ ...s, [name]: value }));
    }

    async function onSaveCategory(e) {
        e.preventDefault();
        if (!category.name?.trim()) return updateNotification(400, "A category needs a name.");
        setSavingCategory(true);
        const [status, message] = await saveGuideCategory({
            ...category,
            order: Number(category.order) || 0,
        });
        setSavingCategory(false);
        if (status === 200) {
            updateNotification(200, "Category saved!");
            setCategory(blankCategory());
            load();
        } else updateNotification(status || 400, message || "Failed.");
    }

    async function onDeleteCategory(row) {
        const [status, message] = await deleteGuideCategory(row.id);
        if (!status) return;
        if (status === 200) {
            updateNotification(200, "Category deleted!");
            load();
        } else updateNotification(status, message || "Failed.");
    }

    if (loading) return <Loader />;

    return (
        <div className="w-full">
            {/* ── the guide being written ─────────────────────────────── */}
            <form onSubmit={onSaveGuide}>
                <Section
                    title={guide.id ? `Editing: ${guide.title}` : "Write a guide"}
                    description="Steps and tips are one per line. What you write here is what every school reads under Guides.">
                    <TextInput grid={8} input={{ name: "title", label: "Title", required: true }}
                        value={guide.title} onChange={onGuideChange} />
                    <SelectInput grid={4}
                        input={{ name: "category", label: "Category", options: categoryOptions }}
                        value={guide.category} onChange={onGuideChange} />

                    <TextInput grid={12} input={{ name: "summary", label: "Summary — one line, shown under the title" }}
                        value={guide.summary} onChange={onGuideChange} />

                    <TextInput grid={5} input={{ name: "where", label: "Where", placeholder: "Payment ▸ Student" }}
                        value={guide.where} onChange={onGuideChange} />
                    <TextInput grid={4} input={{ name: "view", label: "Links to page", placeholder: "payment.student", mask: false }}
                        value={guide.view} onChange={onGuideChange} />
                    <TextInput grid={3} input={{ name: "order", label: "Order", type: "number", mask: false }}
                        value={guide.order} onChange={onGuideChange} />

                    <div className="sm:col-span-6">
                        <Textarea label="Steps — one per line" rows={7}
                            value={asText(guide.steps)}
                            onChange={({ target: { value } }) => onGuideChange({ name: "steps", value })} />
                    </div>
                    <div className="sm:col-span-6">
                        <Textarea label="Tips — one per line" rows={7}
                            value={asText(guide.tips)}
                            onChange={({ target: { value } }) => onGuideChange({ name: "tips", value })} />
                    </div>
                </Section>

                <ButtonsSecion>
                    {guide.id && (
                        <Button variant="outlined" color="blue-gray" onClick={() => setGuide(blankGuide())}>
                            Cancel edit
                        </Button>
                    )}
                    <Button type="submit" color="teal" disabled={saving} loading={saving}>
                        {saving ? "Saving" : guide.id ? "Update guide" : "Add guide"}
                    </Button>
                </ButtonsSecion>
            </form>

            {/* ── the library ─────────────────────────────────────────── */}
            <Section title={`Guides (${guides.length})`} grid={false}
                description="Unpublish rather than delete when a feature only moved — the text stays here.">
                <div className="mb-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => setFilter("")}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors
                            ${filter === "" ? "border-transparent bg-teal-500 text-white"
                                : "border-blue-gray-200 bg-white text-gray-600 hover:border-blue-gray-300"}`}>
                        All
                    </button>
                    {categories.map((c) => (
                        <button key={c.key} type="button" onClick={() => setFilter(filter === c.key ? "" : c.key)}
                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors
                                ${filter === c.key ? "border-transparent bg-teal-500 text-white"
                                    : "border-blue-gray-200 bg-white text-gray-600 hover:border-blue-gray-300"}`}>
                            {c.name}
                        </button>
                    ))}
                </div>

                {visible.length === 0 ? (
                    <p className="rounded-lg bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                        No guides here yet.
                    </p>
                ) : (
                    <ul className="flex flex-col gap-2">
                        {visible.map((row) => (
                            <li key={row.id}
                                className="flex flex-col gap-2 rounded-xl border border-blue-gray-100 bg-white p-3
                                           sm:flex-row sm:items-center sm:gap-3">
                                <div className="min-w-0 flex-1">
                                    <p className="text-[0.68rem] font-bold uppercase tracking-wider text-gray-500">
                                        {categoryName[row.category] || "—"}
                                    </p>
                                    <p className="truncate text-[0.95rem] font-semibold text-gray-900">
                                        {row.title}
                                        {!row.is_active && (
                                            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[0.65rem] font-bold uppercase text-amber-800">
                                                Unpublished
                                            </span>
                                        )}
                                    </p>
                                    <p className="truncate text-xs text-gray-500">{row.summary}</p>
                                </div>
                                <div className="flex shrink-0 items-center gap-1.5">
                                    <Button size="sm" variant="text" color="blue-gray"
                                        className="flex items-center gap-1.5"
                                        onClick={() => onToggleGuide(row)}>
                                        {row.is_active
                                            ? <><EyeSlashIcon className="h-4 w-4" /> Unpublish</>
                                            : <><EyeIcon className="h-4 w-4" /> Publish</>}
                                    </Button>
                                    <Button size="sm" variant="text" color="teal"
                                        className="flex items-center gap-1.5" onClick={() => editGuide(row)}>
                                        <PencilSquareIcon className="h-4 w-4" /> Edit
                                    </Button>
                                    <Button size="sm" variant="text" color="red"
                                        className="flex items-center gap-1.5" onClick={() => onDeleteGuide(row)}>
                                        <TrashIcon className="h-4 w-4" /> Delete
                                    </Button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </Section>

            {/* ── categories ──────────────────────────────────────────── */}
            <form onSubmit={onSaveCategory}>
                <Section title="Categories"
                    description="The filter chips on the Guides page. A category holding guides cannot be deleted — move them first.">
                    {/* 5 + 4 + 3 = 12. The Add button gets its own row rather
                        than a 1-column sliver — at `sm:col-span-1` it was about
                        59px wide and its label was clipped off the card. */}
                    <TextInput grid={5} input={{ name: "name", label: "Category name" }}
                        value={category.name} onChange={onCategoryChange} />
                    <TextInput grid={4} input={{ name: "key", label: "Key (blank = from the name)", mask: false }}
                        value={category.key} onChange={onCategoryChange} />
                    <TextInput grid={3} input={{ name: "order", label: "Order", type: "number", mask: false }}
                        value={category.order} onChange={onCategoryChange} />

                    <div className="sm:col-span-12 flex justify-end">
                        <Button type="submit" color="teal" size="sm" disabled={savingCategory}
                            loading={savingCategory} className="flex items-center gap-1.5 whitespace-nowrap">
                            <PlusIcon className="h-4 w-4" /> Add category
                        </Button>
                    </div>

                    <div className="sm:col-span-12 flex flex-wrap gap-2">
                        {categories.map((c) => (
                            <span key={c.id}
                                className="inline-flex items-center gap-2 rounded-full border border-blue-gray-200 bg-white px-3 py-1.5">
                                <span className="text-xs font-semibold text-gray-700">{c.name}</span>
                                <span className="text-[0.65rem] text-gray-400">
                                    {c.guides_count ?? guides.filter((g) => g.category === c.key).length}
                                </span>
                                <button type="button" aria-label={`delete ${c.name}`}
                                    onClick={() => onDeleteCategory(c)}
                                    className="text-gray-400 transition-colors hover:text-red-500">
                                    <TrashIcon className="h-3.5 w-3.5" />
                                </button>
                            </span>
                        ))}
                    </div>
                </Section>
            </form>
        </div>
    );
}

export default Guides;
