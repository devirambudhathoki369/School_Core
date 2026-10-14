import Badge from "@/components/Badge";
import Cell from "./Cell";

/**
 * A table cell whose value is a STATUS, not free text.
 *
 * `BasicTable` takes a custom renderer as the sixth element of a column
 * descriptor (`col[5]`), so a column opts in by naming this — no change to the
 * table itself:
 *
 *     ['status_str', 'Status', null, false, null, StatusCell]
 *
 * Why it matters: attendance renders `status_str` as the bare lower-case word
 * "present" or "absent", in the same weight and colour as the student's name
 * beside it. On a register of forty rows the one column a teacher is actually
 * scanning is the one with the least visual signal, and the eye has to READ
 * every row rather than seeing the pattern.
 *
 * The absent value carries a reason appended to it (`absent (sick)`), so the
 * leading word is what gets matched and the remainder is kept as-is.
 *
 * Present stays green and absent stays red on every theme, deliberately: a
 * teacher must never have to re-learn the colours because the school changed
 * its palette.
 */
function StatusCell(props) {
    const raw = props?.data;

    if (raw === undefined || raw === null || raw === "" || raw === "-") {
        return <Cell {...props} />;
    }

    const text = String(raw);
    // "absent (on leave)" → keyword "absent", detail "(on leave)".
    const keyword = text.trim().split(/[\s(]/)[0];

    return (
        <div className="flex items-center gap-1.5 px-2 py-1">
            <Badge status={keyword}>{keyword}</Badge>
            {/* The reason is context, not status — it stays plain text so the
                badge keeps meaning exactly one thing. */}
            {text.length > keyword.length && (
                <span className="text-label text-blue-gray-500 truncate" title={text}>
                    {text.slice(keyword.length).trim()}
                </span>
            )}
        </div>
    );
}

export default StatusCell;
