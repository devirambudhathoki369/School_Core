import { memo, useRef } from "react";
import { formatImagePath } from "@/methods/formatMediaPath";
import Image from "next/image";

const LIMIT = 50;
const Cell = memo(function ({ index, col, data, highLighted = false, color = null, editable = false, onChange, onBlur, onShortcut, layout }) {
    (data === undefined || data === '') && (data = '');
    if (typeof (data) === 'number') data = data.toString();
    let size = data?.length;
    if (size < LIMIT) {
        size = (typeof (data) === 'string') ? ((data?.split('')?.length || 0) + 7) : 3;
    } else {
        size = LIMIT;
    }
    const isImage = isAnImageFile(data || "");
    // 
    const inputRef = useRef(null);
    layout = layout === "vertical" ? "flex-col" : "";
    // 
    return (
        <>
            {typeof (data) !== 'object' || editable ?
                <>
                    {isImage ?
                        <>
                            <div className="relative w-10 h-10 ml-2 group overflow-visible">
                                <div className="relative w-full h-full">
                                    <Image unoptimized fill loading="lazy"
                                        alt="student-image"
                                        src={formatImagePath(data)}
                                        className="aspect-square relative rounded object-fill border border-gray-300 shadow-sm group-hover:scale-[4] group-hover:z-[1] transition-transform duration-200 ease-in-out cursor-pointer"
                                        onContextMenu={(e) => e.preventDefault()}
                                    />
                                </div>
                            </div>
                        </> :
                        <>
                            {!editable ?
                                // A read-only cell used to be a DISABLED <input>
                                // sized to its content. An input cannot wrap, so
                                // every column was forced as wide as its longest
                                // value and the table ran off the side of an A4
                                // page — printing then clipped the columns that
                                // no longer fitted. A span wraps onto a second
                                // line inside the same cell instead, so the whole
                                // row stays on the page. (It was disabled, so
                                // nothing could be typed or even selected in it.)
                                <span
                                    style={{ color: color ? color : null }}
                                    className={`app-cell-text block px-2 text-blue-gray-900 leading-relaxed antialiased
                                        whitespace-pre-wrap break-words
                                        ${highLighted ? '!font-bold' : 'font-normal'}`}>
                                    {data}
                                </span>
                                :
                            <input
                                ref={inputRef}
                                size={size}
                                onFocus={() => {
                                    if (inputRef.current) {
                                        inputRef.current.select();
                                    }
                                }}
                                disabled={!editable}
                                color={color || null}
                                style={{
                                    color: color ? color : null
                                }}
                                className={`px-2 bg-transparent text-blue-gray-900 leading-relaxed font-normal antialiased
                            ${editable ? 'w-[95%] border-b-2 border-blue-gray-100' : 'border-none'}
                            ${highLighted ? '!font-bold' : 'font-normal'} `}
                                value={data}
                                onBlur={(e) => {
                                    const { value } = e.target;
                                    onBlur(index, col, value);
                                }}
                                onKeyDown={(e) => {
                                    const { ctrlKey, shiftKey, altKey, key } = e;
                                    onShortcut({ ctrlKey, shiftKey, altKey, key: key.toLowerCase() });
                                }}
                                onChange={(e) => {
                                    const { value } = e.target;
                                    onChange(index, col, value);
                                }} />
                            }
                        </>
                    }
                </> :
                <>
                    <span className={`flex ${layout} gap-0.5`}>
                        {data?.map((item, i) => (
                            <span
                                className="mr-1 px-4 py-1 rounded-md bg-gray-200 text-black whitespace-pre-wrap"
                                key={i}>{item}</span>
                        ))}
                    </span>
                </>
            }
        </>
    )
})

function isAnImageFile(name) {
    if (!name || typeof name !== 'string') return false;
    name = name.toLowerCase();
    return name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg');
}

export default Cell;