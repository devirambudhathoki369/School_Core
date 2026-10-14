import {
    Popover,
    PopoverContent,
    PopoverHandler,
    IconButton,
} from "@material-tailwind/react";
import {
    EyeIcon, EyeSlashIcon, MagnifyingGlassIcon, CheckIcon, ChevronUpDownIcon, XMarkIcon,
} from "@heroicons/react/24/outline";
// 
import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Error } from "../Error";
import { TRANSPORTATION, HOSTEL, HOSTEL_ADMISSION, HOSTEL_DEPOSIT, OLD_DUES } from "@/configs/payment";

// The asterisk on a required field's label.
//
// This was attached only on a theme, on the reasoning that adding a mark is a
// visible change and Classic was to stay exactly as it was. That trade is the
// wrong way round: a form that does not say which fields are mandatory until
// the server rejects it is a usability defect, and it was left in place for the
// majority of schools. `.required::after` in globals.css is unscoped, so the
// mark renders correctly everywhere — the gate was the only thing withholding
// it.
function useRequiredClass(input) {
    return input?.required ? 'required' : '';
}

//   -------------------------------------------->
const OPTION_OTHER = { name: 'Other', value: 0 };
const OPTION_NONE = { name: 'None', value: "" };
const OPTION_ALL = { name: 'All', value: "" };
const OPTION_TRANSPORTATION = { name: 'transportation', value: TRANSPORTATION };
const OPTION_HOSTEL = { name: 'hostel', value: HOSTEL };
const OPTION_HOSTEL_ADMISSION = { name: 'hostel admission', value: HOSTEL_ADMISSION };
const OPTION_HOSTEL_DEPOSIT = { name: 'hostel deposit', value: HOSTEL_DEPOSIT };
/**
 * The hostel fee titles — but ONLY for a school that has the hostel module.
 *
 * Three extra rows in the title dropdown of every ledger screen, at every
 * school that will never run a hostel, is a product made worse for the majority
 * by a feature one school bought. Every caller that offers fee titles asks this
 * instead of listing them directly, and gets an empty array for everyone else.
 *
 * The backend gates the same three titles independently
 * (`main/methods/hostelRates.schoolUsesHostel`), so this is about not showing a
 * school something meaningless — not about trust.
 */
function hostelTitleOptions(profile) {
    if (!profile?.uses_hostel) return [];
    return [OPTION_HOSTEL, OPTION_HOSTEL_ADMISSION, OPTION_HOSTEL_DEPOSIT];
}
const OPTION_OLDDUES = { name: 'old dues', value: OLD_DUES };
//
// Field names that house a YYYY-MM-DD date in this app:
//   - anything containing the token "date" (date, birth_date, issue_date, …)
//   - bare "from" / "to" used as a date range (every range picker in the
//     reports uses those names; they only ever carry a BS date)
//   - "dob"
const DATE_FIELD_RE = /(?:^|_)date(?:_|$)|^(?:from|to|dob)$/;
// Some inputs reuse generic names but the label tags it as a date
// ("(BS)" or contains the word "date"). Letting the label opt in here keeps
// the call sites lean — pages don't have to add `mask: 'date'` to every
// date TextInput one by one.
const DATE_LABEL_RE = /\bdate\b|\(\s*bs\s*\.?\s*\)/i;
function isDateField(input) {
    if (input?.mask === 'date') return true;
    if (input?.mask === false) return false;
    const name = input?.name || '';
    if (DATE_FIELD_RE.test(name)) return true;
    const label = input?.label || '';
    if (label && DATE_LABEL_RE.test(label)) return true;
    return false;
}
function applyDateMask(value) {
    const digits = (value || '').toString().replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 4) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}
//
function _TextInput({ input, value, error, info, onChange = () => null, onBlur = () => null, prefix, suffix, suggestions, grid = 4 }) {
    /**
     * input {label:text, readonly:bool, type:text, name:text}
     * value: any
     * onChange: function()
     * prefix or suffix: {type: Icon or IconButton}
     */
    const [focused, setFocused] = useState(false);
    // `htmlFor` pointed at `input.name`, but the <input> below only ever set
    // `name` — never a matching `id`. An `htmlFor` with no `id` to bind to is
    // inert, so EVERY label in this app was decorative: clicking one did not
    // focus its field, and a screen reader announced the input as unlabelled.
    // `useId` rather than the name itself because the same field name is reused
    // across forms on one page (`school`, `date`, `from`…), and duplicate ids
    // would bind a label to whichever field rendered first.
    const autoId = useId();
    const fieldId = input?.id || `${autoId}-${input?.name || 'field'}`;
    const errorId = `${fieldId}-error`;
    const requiredCls = useRequiredClass(input);
    // 
    return (
        <div className={`sm:col-span-${grid}`} hidden={input?.hidden}>
            <label hidden={input?.hideLabel} htmlFor={fieldId}
                className={`app-field-label text-sm font-medium leading-6 text-gray-900 capitalize ${requiredCls}`}>
                {input?.label}
            </label>
            <div className={`app-field-shell p-0 m-0 mt-1 w-full flex items-center shadow-sm border bg-white/40
                border-blue-gray-200 rounded-[7px] transition-all duration-150
                ${focused ? 'app-field-focused !border-teal-400 ring-2 ring-teal-400/40 shadow-md bg-white/70' : 'hover:border-blue-gray-300'}`}>
                {prefix &&
                    <div className="mr-1">
                        {prefix}
                    </div>
                }
                <input
                    id={fieldId}
                    // REVERTED, and deliberately staying reverted.
                    //
                    // This was `value ?? ''` to keep the input controlled from
                    // the first paint and silence React's uncontrolled→controlled
                    // warning. That is correct in theory and was WRONG to ship:
                    // it turns every field whose parent passes a value that never
                    // updates into a field pinned at '' — the text simply cannot
                    // be typed. Undefined leaves the input uncontrolled, so the
                    // DOM keeps what the user types and such a form still works.
                    //
                    // It took down "New Accounting Economic Year Setup" in prod,
                    // where all three inputs read `year?.*` (the CURRENT fiscal
                    // year from context) while the handler wrote to `newYear`.
                    // That mismatch is a bug in the caller and is fixed there —
                    // but the coercion turns a latent caller bug into a dead
                    // field, and there is no way to be sure every one of the
                    // hundreds of call sites is wired correctly.
                    //
                    // Fix the call sites; do not re-add this.
                    placeholder={isDateField(input) ? (input?.placeholder || 'YYYY-MM-DD') : input?.placeholder}
                    value={value}
                    autoComplete={input?.autoComplete}
                    // Announce the failure to a screen reader instead of leaving
                    // it as red text only sighted users can find.
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                    maxLength={isDateField(input) ? 10 : undefined}
                    onChange={({ target: { value } }) => {
                        const v = isDateField(input) ? applyDateMask(value) : value;
                        onChange({ name: input?.name, value: v });
                    }}
                    onBlur={({ target: { value } }) => {
                        setFocused(false);
                        // if (input?.type === 'number' && !value) return; // forgot to comment why i added this?
                        const v = isDateField(input) ? applyDateMask(value) : value;
                        onBlur({ name: input?.name, value: v });
                    }}
                    onFocus={() => {
                        if (!input?.readOnly) setFocused(true);
                    }}
                    readOnly={input?.readOnly || false}
                    required={input?.required || false}
                    type={input?.type || 'text'}
                    name={input?.name}
                    className={`text-black p-1.5 placeholder:text-gray-500 sm:text-base sm:leading-6 
                        font-sans w-full my-0 bg-transparent focus:outline-none 
                        placeholder:text-sm
                        ${input?.readOnly ? '!text-gray-700' : ''} 
                        `}
                />
                {suffix &&
                    <div className="ml-1">
                        {suffix}
                    </div>
                }
            </div>
            {
                !input?.readOnly &&
                <Error error={error} id={errorId} />
            }
            <InputInfo info={info} />
        </div>
    )
}
const TextInput = memo(_TextInput);

// An option can carry a `tone` to say something about the CHOICE itself rather
// than about the field — "this month is already posted", say. A tag inside the
// label ("[already billed]") is easy to miss when a dropdown holds a dozen
// look-alike lines, so the tint does the scanning: the eye finds the already-
// done rows without reading any of them. Light fills only — an option still has
// to read as an option, and the tag stays as the actual statement for the
// platforms (macOS/Safari) that render option colours their own way.
const OPTION_TONES = {
    // already done / posted — the same amber the month chips use for a period
    // that carries a posting but stays choosable.
    warn: { background: '#fef3c7', color: '#78350f' },
    // present but not the ordinary case — dimmer, never alarming.
    muted: { background: '#f1f5f9', color: '#475569' },
};
function SelectInput({ input, value, error, info, onChange = () => null, onBlur = () => null, grid = 4 }) {
    // The tint disappears the moment the list closes, and the closed control is
    // what someone actually looks at before hitting Save — so the chosen option's
    // tone carries over onto the field itself. Through a data attribute, not an
    // inline style: a theme sets `.app-select { background: #fff !important }`,
    // which an inline background cannot beat (globals.css can).
    const selectedTone = input?.options
        ?.find(option => `${option?.value}` === `${value}`)?.tone;
    // Same unbound-label fault as TextInput — see the note there.
    const autoId = useId();
    const fieldId = input?.id || `${autoId}-${input?.name || 'select'}`;
    const errorId = `${fieldId}-error`;
    const requiredCls = useRequiredClass(input);
    // A caller that supplies its own empty-valued option ("All", "None") has
    // already named the empty state. Rendering the built-in placeholder as well
    // puts TWO options with value "" in the list, and the browser selects the
    // first one — so the field read "Select Status" instead of "All", and
    // picking "All" snapped straight back to the placeholder, which made the
    // option impossible to select at all. Theirs wins when they provide one.
    const hasOwnEmptyOption = input?.options?.some(option => option?.value === '');
    return (
        <div className={`sm:col-span-${grid}`}>
            <label hidden={input?.hideLabel} htmlFor={fieldId}
                className={`app-field-label text-sm font-medium leading-6 text-gray-900 ${requiredCls}`}>
                {input?.label}
            </label>
            <div className="mt-1">
                <select id={fieldId} onChange={(e) => {
                    const { name, value } = e.target;
                    onChange({ name, value });
                    onBlur({ name, value });
                }}
                    // `${undefined}` stringifies to the literal "undefined",
                    // which matches no <option> at all — so the control was
                    // left with no selected index rather than resting on its
                    // own "Select …" placeholder. Mapped to '' so it selects
                    // the placeholder option deliberately.
                    value={value === undefined || value === null ? '' : `${value}`}
                    name={input.name} disabled={input?.readOnly}
                    required={input?.required || false}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                    data-tone={OPTION_TONES[selectedTone] ? selectedTone : undefined}
                    className="app-select capitalize text-gray-800 w-full text-base focus:outline-none p-2 bg-white/40 border border-blue-gray-200 rounded-[7px] cursor-pointer shadow-sm transition-all duration-150 hover:border-blue-gray-300 focus:!border-teal-400 focus:ring-2 focus:ring-teal-400/40 focus:bg-white/70">
                    <>
                        {!hasOwnEmptyOption &&
                            <option value="">Select {input?.placeholder || input?.label}</option>}
                        {input.options
                            .map((option, oi) => (
                                <option className="uppercase text-base" key={oi} value={`${option.value}`}
                                    style={OPTION_TONES[option?.tone]}>{option.name}</option>
                            ))}
                    </>
                </select>
            </div>
            <Error error={error} id={errorId} />
            <InputInfo info={info} />
        </div >
    )
}

// ---------------------------------------------------------------------------
// SearchInput — the picker behind every "choose a student / staff / title"
// field (92 files).
//
// It used to open a Material Tailwind <List> of UPPERCASED rows, or — in its
// tabular form — a <table> whose every cell was a `ColumnHeader` <th>: bold,
// padded 1rem on each side, inside a 25rem panel. Three columns of that could
// not fit, so a name like "Bandana Bista Bhandari" broke over three lines, a
// zero balance rendered as an empty cell (`0 || ""`), nothing could be reached
// by keyboard, and a search only started filtering from the second letter.
//
// Now it is a proper combobox:
//   · the trigger is a button that looks like every other field and says what
//     it is for ("Select staff…"), with a caret so it reads as a picker;
//   · the panel is at least as wide as the field, one line per row, the
//     matched letters marked, the chosen row ticked;
//   · ↑ ↓ move, Enter picks, Esc closes, and typing filters from the FIRST
//     letter, across every word and every column shown (so "khanal ab" and
//     "teacher" both find Abisha Khanal);
//   · in tabular form the first column is the row's name with its initials, the
//     second sits under it as the subtitle, and the rest are right-hand columns
//     — numbers set in tabular figures with the house `en-IN` grouping, so a
//     zero balance reads "0.00" instead of vanishing.
//
// The contract with callers is unchanged: same props, same `onChange` /
// `onBlur({ name, value })` shapes, same `option.value || ''` on a single pick,
// and a pick is still remembered when a caller never feeds `value` back.
// ---------------------------------------------------------------------------

// Loose so a numeric id matches its string form ("12" vs 12) — the picker is
// fed both, depending on which API filled the options.
const sameValue = (a, b) => `${a}` === `${b}`;

function optionText(option) {
    if (option === null || option === undefined) return '';
    if (typeof option !== 'object') return `${option}`;
    return `${option?.name ?? ''}`;
}

// Words of the query, each of which must appear somewhere in the row.
function queryTokens(query) {
    return `${query || ''}`.toLowerCase().split(/\s+/).filter(Boolean);
}

function matchesTokens(haystack, tokens) {
    if (tokens.length < 1) return true;
    const hay = haystack.toLowerCase();
    return tokens.every(token => hay.includes(token));
}

// Wraps every occurrence of any query word in <mark>. Plain text in, nodes out.
function Highlight({ text, tokens }) {
    const value = `${text ?? ''}`;
    if (!value || tokens.length < 1) return value;
    const escaped = tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const parts = value.split(new RegExp(`(${escaped.join('|')})`, 'ig'));
    return parts.map((part, i) => (
        tokens.some(t => part.toLowerCase() === t)
            ? <mark key={i} className="app-picker-mark">{part}</mark>
            : <span key={i}>{part}</span>
    ));
}

function initialsOf(text) {
    const words = `${text || ''}`.trim().split(/\s+/).filter(Boolean);
    if (words.length < 1) return '?';
    const first = words[0][0] || '';
    const last = words.length > 1 ? (words[words.length - 1][0] || '') : '';
    return `${first}${last}`.toUpperCase();
}

const NUMERIC_RE = /^-?\d+(?:\.\d+)?$/;
// Only a MONEY column is set as money. A phone number, a roll number or an id
// is numeric too, and "9857000000" must not come out as "98,57,00,00,000.00".
const MONEY_KEY_RE = /balance|amount|due|paid|total|salary|fee|fine|price|credit|debit/i;
function formatMeta(raw, key) {
    if (raw === null || raw === undefined || raw === '') return { text: '—', numeric: false, empty: true };
    const isNumber = typeof raw === 'number' || (typeof raw === 'string' && NUMERIC_RE.test(raw.trim()));
    if (isNumber && MONEY_KEY_RE.test(`${key || ''}`)) {
        const n = Number(raw);
        return {
            text: n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            numeric: true,
            negative: n < 0,
            zero: n === 0,
        };
    }
    return { text: `${raw}`, numeric: false };
}

function _SearchInput({ input, value, error, info, onChange = () => null, onBlur = () => null,
    multiSelect = false, optionsAsElement = false, tabular = false, columns, grid = 4 }) {
    const options = useMemo(() => input?.options || [], [input?.options]);
    const cols = useMemo(() => (columns?.length ? columns : [['name']]), [columns]);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    // The last pick, for callers that never feed `value` back (see the header
    // note). Forgotten whenever `value` itself changes, so a form reset clears
    // the field exactly as it used to.
    const [picked, setPicked] = useState('');
    useEffect(() => { setPicked(''); }, [value]);
    const listRef = useRef(null);
    // The panel is at least as wide as the field it drops from — a 25rem list
    // under a 40rem field read as a different control. Measured on open.
    const [panelWidth, setPanelWidth] = useState(0);

    const autoId = useId();
    const fieldId = input?.id || `${autoId}-${input?.name || 'search'}`;
    const listId = `${fieldId}-list`;
    const errorId = `${fieldId}-error`;
    const requiredCls = useRequiredClass(input);
    const disabled = !!input?.readOnly;

    const selected = useMemo(() => {
        if (multiSelect) return Array.isArray(value) ? value : [];
        return (value === undefined || value === null || value === '') ? [] : [value];
    }, [multiSelect, value]);
    const isSelected = useCallback(option => (
        typeof option === 'object' && selected.some(v => sameValue(v, option?.value))
    ), [selected]);

    const display = useMemo(() => {
        const names = options.filter(isSelected).map(optionText).filter(Boolean);
        return names.join(', ') || picked;
    }, [options, isSelected, picked]);

    const tokens = useMemo(() => queryTokens(query), [query]);
    const filtered = useMemo(() => {
        if (tokens.length < 1) return options;
        return options.filter(option => {
            const hay = tabular && typeof option === 'object'
                ? cols.map(col => option?.[col[0]] ?? '').join(' ')
                : optionText(option);
            return matchesTokens(hay, tokens);
        });
    }, [options, tokens, tabular, cols]);

    // Opening lands on the current choice, so Enter straight away keeps it.
    useEffect(() => {
        if (!open) return;
        const at = filtered.findIndex(isSelected);
        setActive(at >= 0 ? at : 0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);
    // A new query starts from its best match.
    useEffect(() => { setActive(0); }, [query]);
    // Keep the keyboard row in view.
    useEffect(() => {
        if (!open) return;
        const row = listRef.current?.querySelector(`[data-index="${active}"]`);
        row?.scrollIntoView?.({ block: 'nearest' });
    }, [active, open]);

    function setOpenState(next) {
        const state = typeof next === 'function' ? next(open) : next;
        if (state && disabled) return;
        if (state) setPanelWidth(document.getElementById(fieldId)?.offsetWidth || 0);
        // Closing with nothing chosen is the "touched and left empty" moment a
        // required field validates on — the old picker reported it the same way.
        if (!state && open && !display) {
            onBlur({ name: input?.name, value });
        }
        if (!state) setQuery('');
        setOpen(state);
    }

    function pick(option) {
        if (option === undefined) return;
        let next = option?.value || '';
        if (multiSelect) {
            const current = Array.isArray(value) ? value : [];
            next = current.some(v => sameValue(v, option?.value))
                ? current.filter(v => !sameValue(v, option?.value))
                : [...current, option?.value || ''];
            setPicked((options.filter(o => next.some(v => sameValue(v, o?.value)))).map(optionText).join(', '));
        } else {
            setPicked(optionText(option));
            setQuery('');
            setOpen(false);
        }
        onChange({ name: input?.name, value: next });
        onBlur({ name: input?.name, value: next });
    }

    function onSearchKeyDown(e) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive(i => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive(i => Math.max(i - 1, 0));
        } else if (e.key === 'Home' && !query) {
            e.preventDefault(); setActive(0);
        } else if (e.key === 'End' && !query) {
            e.preventDefault(); setActive(Math.max(filtered.length - 1, 0));
        } else if (e.key === 'PageDown') {
            e.preventDefault(); setActive(i => Math.min(i + 8, Math.max(filtered.length - 1, 0)));
        } else if (e.key === 'PageUp') {
            e.preventDefault(); setActive(i => Math.max(i - 8, 0));
        } else if (e.key === 'Enter') {
            // Never let Enter inside the picker submit the form around it.
            e.preventDefault();
            if (filtered[active] !== undefined) pick(filtered[active]);
        } else if (e.key === 'Tab') {
            setOpenState(false);
        }
    }

    const label = input?.label || '';
    const noun = `${label}`.trim().toLowerCase();
    const placeholder = input?.placeholder
        || (input?.hideLabel ? `Search ${label}` : (noun ? `Select ${noun}…` : 'Select…'));
    const [primaryCol, secondaryCol, ...metaCols] = cols;

    return (
        // Same `grid` escape hatch TextInput and SelectInput carry.
        <div className={`sm:col-span-${grid}`}>
            <label hidden={input?.hideLabel} htmlFor={fieldId}
                className={`app-field-label text-sm font-medium leading-6 text-gray-900 capitalize ${requiredCls}`}>
                {label}
            </label>
            {/* A dropdown belongs under its field; floating-ui flips it above on
                its own when there is no room below (a phone keyboard). */}
            <Popover open={open && !disabled} handler={setOpenState} placement="bottom-start" offset={6}>
                <PopoverHandler>
                    <button type="button" id={fieldId} disabled={disabled}
                        aria-haspopup="listbox" aria-expanded={open && !disabled} aria-controls={listId}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ? errorId : undefined}
                        title={display || undefined}
                        onKeyDown={(e) => {
                            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                                e.preventDefault();
                                setOpenState(true);
                            }
                        }}
                        className={`app-field-shell app-picker-trigger mt-1 ${open ? 'app-field-focused' : ''}`}>
                        <span className={`app-picker-value ${display ? '' : 'is-placeholder'}`}>
                            {display || placeholder}
                        </span>
                        <ChevronUpDownIcon className="app-picker-caret" aria-hidden="true" />
                    </button>
                </PopoverHandler>
                {/* Above a Material Tailwind dialog (its backdrop is z-[9999]),
                    so a picker opened inside one is not drawn behind it. */}
                <PopoverContent className={`app-picker z-[10001] p-0 ${tabular ? 'app-picker-wide' : ''}`}>
                    <div className="app-picker-body" style={{ '--picker-w': `${panelWidth}px` }}>
                    {options.length > 0 ?
                        <>
                            <div className="app-picker-search">
                                <MagnifyingGlassIcon className="app-picker-search-icon" aria-hidden="true" />
                                <input type="text" value={query} autoComplete="off" spellCheck={false}
                                    role="combobox" aria-expanded="true" aria-controls={listId}
                                    aria-activedescendant={filtered.length ? `${listId}-${active}` : undefined}
                                    aria-label={`Search ${label}`}
                                    placeholder={`Search ${noun || 'options'}…`}
                                    onChange={(e) => setQuery(e.target.value)}
                                    onKeyDown={onSearchKeyDown} />
                                {query &&
                                    <button type="button" className="app-picker-clear" aria-label="Clear search"
                                        onClick={() => setQuery('')}>
                                        <XMarkIcon className="h-3.5 w-3.5" aria-hidden="true" />
                                    </button>}
                            </div>
                            {tabular && filtered.length > 0 &&
                                <div className="app-picker-head" aria-hidden="true">
                                    <span className="app-picker-head-main">{primaryCol?.[1] || primaryCol?.[0]}</span>
                                    {metaCols.map((col, ci) => (
                                        <span key={ci} className="app-picker-head-meta">{col?.[1] || col?.[0]}</span>
                                    ))}
                                </div>}
                            <div ref={listRef} id={listId} role="listbox" aria-multiselectable={multiSelect || undefined}
                                aria-label={label} className="app-picker-list">
                                {filtered.map((option, index) => {
                                    const chosen = isSelected(option);
                                    const text = optionText(option);
                                    return (
                                        <div key={`${option?.value ?? text}-${index}`}
                                            id={`${listId}-${index}`} data-index={index}
                                            role="option" aria-selected={chosen}
                                            data-active={index === active || undefined}
                                            className={`app-picker-option ${tabular ? 'app-picker-row' : ''}`}
                                            // mousedown would blur the search box first
                                            onMouseDown={(e) => e.preventDefault()}
                                            onMouseMove={() => { if (index !== active) setActive(index); }}
                                            onClick={() => pick(option)}>
                                            {tabular ?
                                                <>
                                                    <span className="app-picker-avatar" aria-hidden="true">
                                                        {initialsOf(option?.[primaryCol?.[0]])}
                                                    </span>
                                                    <span className="app-picker-main">
                                                        <span className="app-picker-text">
                                                            <Highlight text={option?.[primaryCol?.[0]]} tokens={tokens} />
                                                        </span>
                                                        {secondaryCol && option?.[secondaryCol[0]] !== undefined &&
                                                            option?.[secondaryCol[0]] !== null && option?.[secondaryCol[0]] !== '' &&
                                                            <span className="app-picker-sub">
                                                                <Highlight text={option?.[secondaryCol[0]]} tokens={tokens} />
                                                            </span>}
                                                    </span>
                                                    {metaCols.map((col, ci) => {
                                                        const meta = formatMeta(option?.[col[0]], col[0]);
                                                        return (
                                                            <span key={ci} title={meta.empty ? undefined : meta.text}
                                                                className={`app-picker-meta ${meta.numeric ? 'is-num' : ''}
                                                                    ${meta.negative ? 'is-neg' : ''} ${meta.zero || meta.empty ? 'is-dim' : ''}`}>
                                                                {meta.numeric ? meta.text : <Highlight text={meta.text} tokens={tokens} />}
                                                            </span>
                                                        );
                                                    })}
                                                </> :
                                                <span className="app-picker-text">
                                                    {optionsAsElement ? option?.element : <Highlight text={text} tokens={tokens} />}
                                                </span>
                                            }
                                            <CheckIcon className={`app-picker-check ${chosen ? '' : 'invisible'}`} aria-hidden="true" />
                                        </div>
                                    );
                                })}
                                {filtered.length < 1 &&
                                    <div className="app-picker-empty" role="status">
                                        No {noun || 'option'} matches “{query.trim()}”
                                    </div>}
                            </div>
                            <div className="app-picker-foot">
                                <span>
                                    {tokens.length > 0
                                        ? `${filtered.length} of ${options.length}`
                                        : `${options.length} ${options.length === 1 ? 'option' : 'options'}`}
                                    {multiSelect && selected.length > 0 && ` · ${selected.length} selected`}
                                </span>
                                <span className="app-picker-keys" aria-hidden="true">
                                    <kbd>↑</kbd><kbd>↓</kbd> move <kbd>Enter</kbd> {multiSelect ? 'toggle' : 'select'} <kbd>Esc</kbd> close
                                </span>
                            </div>
                        </> :
                        <div className="app-picker-empty">
                            Nothing to choose from yet.
                        </div>
                    }
                    </div>
                </PopoverContent>
            </Popover>
            <Error error={error} id={errorId} />
            <InputInfo info={info} />
        </div>
    )
}

const SearchInput = memo(_SearchInput);

function PasswordInput({ input, value, error, onChange = () => null, onBlur = () => null, }) {
    const [passwordType, setPasswordType] = useState(true);
    return (
        <TextInput suffix={
            // `type="button"` is the load-bearing part. A <button> with no type
            // inside a <form> defaults to submit, and this one lives inside the
            // login form — so revealing the password could post the form. It
            // also had no accessible name at all: a screen reader announced the
            // control as just "button", and the state it toggles (shown/hidden)
            // was carried only by which of two icons was drawn.
            <IconButton variant="text" type="button"
                aria-label={passwordType ? "Show password" : "Hide password"}
                aria-pressed={!passwordType}
                onClick={() => {
                    setPasswordType(state => !state);
                }}>
                {passwordType
                    ? <EyeIcon className="icon" aria-hidden="true" />
                    : <EyeSlashIcon className="icon" aria-hidden="true" />}
            </IconButton>
        } input={{ ...input, type: passwordType ? 'password' : 'text' }}
            value={value} onChange={onChange} onBlur={onBlur} error={error} />
    )
}

function InputInfo({ info, className }) {
    return (
        <>
            {info &&
                <p className={`app-field-info ${className || ''}`}>{info}</p>}
        </>
    );
}

export { OPTION_OTHER, OPTION_NONE, OPTION_TRANSPORTATION, OPTION_HOSTEL,
    OPTION_HOSTEL_ADMISSION, OPTION_HOSTEL_DEPOSIT, hostelTitleOptions,
    OPTION_OLDDUES, OPTION_ALL };
export { TextInput, SelectInput, SearchInput, PasswordInput, InputInfo };