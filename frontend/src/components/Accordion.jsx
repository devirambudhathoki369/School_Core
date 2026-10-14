import { useState } from "react";
import { Accordion as AccordianMT, AccordionBody, AccordionHeader } from "@material-tailwind/react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";

const CUSTOM_ANIMATION = {
    mount: { scale: 1 },
    unmount: { scale: 0.9 },
};
function Accordion({ title, description, children }) {
    const [opened, setOpened] = useState(false);

    return (
        <>
            <AccordianMT open={opened} animate={CUSTOM_ANIMATION} className="mt-2 shadow-default"
                icon={
                    <ChevronDownIcon
                        strokeWidth={2.5}
                        className={`mx-auto h-5 w-5 transition-transform ${opened ? "rotate-180" : ""}`}
                    />
                }>
                <AccordionHeader className="bg-teal-100 p-3 rounded-sm" onClick={() => {
                    setOpened(state => !state);
                }}>
                    <div className="text-black flex flex-col text-base gap-y-1 py-1">
                        <h1>{title}</h1>
                        {description && <span className="font-normal">&nbsp; {description}</span>}
                    </div>
                </AccordionHeader>
                <AccordionBody>
                    {opened &&
                        <div className="px-2">
                            {children}
                        </div>
                    }
                </AccordionBody>
            </AccordianMT>
        </>
    )
}

export default Accordion;