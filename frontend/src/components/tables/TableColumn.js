/**
 * @param {string} [key] - item's key
 * @param {string} [displayName] - column's display name
 * @param {string} [tooltip] - column tooltip/description
 * @param {boolean} [highlightColumn] - highlight column or not.
 * @param {string} [layout="horizontal"] - Allowed options: "horizontal" | "vertical"
 */
class TableColumn {
    constructor(key, displayName = '', tooltip = '', highlightColumn = false, layout = "horizontal") {
        this.key = key;
        this.displayName = displayName || key;
        this.tooltip = tooltip;
        this.highlightColumn = highlightColumn;
        this.layout = layout;

    }
    asList() {
        return [
            this.key, this.displayName, this.tooltip, this.highlightColumn, this.layout
        ]
    }
}

export default TableColumn;