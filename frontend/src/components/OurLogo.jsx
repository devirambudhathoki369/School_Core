import Image from "next/image";

function OurLogo({ size = 40 }) {
    return (
        <Image alt="CentEducation SMSYS" src={"/logo.png"} width={size} height={size}
            onContextMenu={(e) => { e.preventDefault(); }} loading="lazy" />
    )
}

export default OurLogo;