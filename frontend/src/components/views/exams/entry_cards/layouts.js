const LAYOUT_GRID = 1, LAYOUT_VERTICAL = 2;
const ENTRY_CARD_VIEW_OPTIONS = [
    { name: 'Grid Layout', value: LAYOUT_GRID },
    { name: 'Vertical Layout', value: LAYOUT_VERTICAL },
];
const LAYOUT_STYLES = {
    [LAYOUT_GRID]: "grid grid-cols-2",
    [LAYOUT_VERTICAL]: "grid grid-cols-1 grid-rows-3",
};

export {
    LAYOUT_GRID, LAYOUT_VERTICAL,
    ENTRY_CARD_VIEW_OPTIONS, LAYOUT_STYLES,
};