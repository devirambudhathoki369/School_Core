import { formatImagePath } from "@/methods/formatMediaPath";
import Image from "next/image";

function DashedLine() {
    return (
        <span className="border-[1px] border-dashed border-black my-2"></span>
    )
}

function Signature({ user, sign, username, designation = null }) {
    return (
        <div className="flex flex-col w-1/4">
            <div className="w-[100px] mx-auto">
                {sign ?
                    <Image unoptimized src={formatImagePath(sign)} alt={user}
                        width={3840} height={3840} quality={70} className={'min-h-[50px]'} />
                    : <div className="min-h-[50px] flex items-end justify-center">{username}</div>
                }
            </div>
            <DashedLine />
            <span className="text-center capitalize">{user}</span>
            {designation && <span className="text-center">{designation}</span>}
        </div>
    )
}

export default Signature;