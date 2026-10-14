import { useEffect, useRef, useState } from "react";

export default function CPlaceholder({ editable, size, name, value, onChange: onChangeOG, focused = false, className }) {
    const [width, setWidth] = useState(null);
    const inpRef = useRef(null);

    function onChange(e) {
        const { value: newData } = e.target;
        onChangeOG({ name, value: newData });
    }
    //
    useEffect(() => {
        if (focused && inpRef.current) {
            inpRef.current.focus();
        }
    }, [focused]);

    useEffect(() => {
        setWidth(size + 'mm');
    }, [size]);

    return (
        <input ref={inpRef}
            className={`cc-data h-5 border-b-[1px] bg-transparent border-black border-dashed text-center mx-1 focus:outline-none font-bold ${className}`} disabled={!editable}
            style={{ width }}
            value={value} onChange={onChange} />
    )
}