import { memo } from "react";
import Image from "next/image";
import { formatImagePath } from "@/methods/formatMediaPath";

/**
 * Larger student photo for the payment student list. Mirrors the default Cell's
 * image rendering (hover-zoom) but at a bigger base size. Scoped to this table.
 */
const StudentImageCell = memo(function ({ data }) {
    if (!data) return null;
    return (
        <div className="relative w-16 h-16 ml-2 group overflow-visible">
            <div className="relative w-full h-full">
                <Image
                    unoptimized
                    fill
                    loading="lazy"
                    alt="student-image"
                    src={formatImagePath(data)}
                    className="aspect-square relative rounded object-fill border border-gray-300 shadow-sm group-hover:scale-[4] group-hover:z-[1] transition-transform duration-200 ease-in-out cursor-pointer"
                    onContextMenu={(e) => e.preventDefault()}
                />
            </div>
        </div>
    );
});

export default StudentImageCell;
