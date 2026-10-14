import { useState } from "react";

/**
 * The last value that was not empty.
 *
 * A dialog is closed by clearing the record it shows, and it then takes a
 * moment to fade out. Read through this, it still has that record to show
 * while it leaves, instead of collapsing to an empty box on the way.
 */
const useLastValue = (value) => {
    const [last, setLast] = useState(value);
    if (value && value !== last) setLast(value);
    return value || last;
}

export default useLastValue;
