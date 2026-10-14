import { Button, Tooltip } from "@material-tailwind/react";

/**
 * Action button for table
 * @param setSelected returns (id) => {}
 * @param onSelect returns (action, id, item) => {}
 */
function ActionButton({ action, item, setSelected, onSelect, disabled = false }) {
    // delete is destructive → rose; every other action takes the accent. Both
    // are TINTED at rest and fill on hover (globals.css `.app-row-action`): a
    // column of solid teal and red blocks down every row outweighed the data
    // the row was about.
    const isDanger = action?.action === 'delete';
    const tone = isDanger ? "app-row-action-danger" : "";
    return (
        <Tooltip className={`text-sm ${action?.tooltip ? '' : 'hidden'}`} content={action?.tooltip || null}>
            {/* When an action carries an icon, `action?.icon || action?.text`
                below renders the icon ALONE — and `editAction` / `deleteAction`
                ship an icon with no `tooltip`, so those buttons had no
                accessible name of any kind on all 89 tables. A screen reader
                announced every row as a line of identical unnamed buttons, and
                one of them deletes the record.

                `text` is always present on every action in actions.jsx, so it
                is the reliable name; the tooltip is preferred when the author
                wrote a more specific one. Invisible either way, so it applies
                on Classic too. */}
            <Button variant="text" type="button"
                aria-label={action?.tooltip || action?.text || action?.action}
                className={`app-row-action ${tone}`}
                disabled={disabled} onClick={() => {
                    setSelected(item?.id || item?.value);
                    onSelect(action?.action, item?.id || item?.value, item);
                }}>
                {action?.icon || action?.text}
            </Button>
        </Tooltip>
    )
}

export default ActionButton;