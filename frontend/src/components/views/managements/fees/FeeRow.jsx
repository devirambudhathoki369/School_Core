import { Accordion, AccordionHeader, AccordionBody, Chip, Tooltip, Button } from "@material-tailwind/react";
import { useEffect, useState } from "react";
import { ChevronUpIcon, ChevronDownIcon, EyeDropperIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import { useFees } from "@/contexts/fees/FeesContext";
import { editAction } from "@/components/tables/actions";
import ActionButton from "@/components/buttons/ActionButton";
import Checkbox from "@/components/inputs/Checkbox";

function FeeRow({ frIndex, cid, cls }) {
    const [checked, setChecked] = useState('');
    const [class_name, class_info, count] = cls;
    const { data: { fees },
        methods: { onEdit, getFeesByClassId, setForm } } = useFees();
    const [open, setOpen] = useState(false);
    // 
    function onEditButtonClick(feeId, titleId, fee, class_details) {
        const feeObj = {
            id: feeId, title: titleId, fee,
            ...class_details
        };
        onEdit(feeObj);
        setChecked(feeId);
    }
    // 
    useEffect(() => {
        if (open && cid && count > 0 && !fees?.fees?.[cid]) {
            (async () => {
                await getFeesByClassId(cid);
            })();
        }
    }, [open]);
    // 
    return (
        <Accordion open={cid ? open : false} icon={
            (cid && count > 0) ?
                (open ? <ChevronUpIcon className="icon" /> : <ChevronDownIcon className="icon" />) :
                <span className="px-2"></span>
        }>
            <AccordionHeader onClick={() => {
                setOpen(state => !state);
            }} className={`bg-teal-100 ${cid && 'hover:bg-teal-200'} font-semibold rounded-md flex flex-row !justify-between p-3 my-0.5`}>
                <span className={`flex justify-between items-center w-full`}>
                    <span className="flex gap-x-2 items-center">
                        {count > 0 ?
                            <Tooltip content={"Click to add fee in this class!"}>
                                <EyeDropperIcon className="icon min-w-[1.15rem]" onClick={(e) => {
                                    e.stopPropagation();
                                    const { id, school, ...class_info_details } = class_info;
                                    // console.log(class_info_details);
                                    setForm(state => ({ ...state, ...class_info_details }));
                                }} />
                            </Tooltip> :
                            <span className="min-w-[1.15rem]"></span>
                        }
                        <span className="uppercase">{class_name}</span>
                    </span>
                    <Chip value={count} size="sm" variant="ghost" color="blue-gray" className="rounded-full m-0 p-0 bg-transparent" />
                </span>
            </AccordionHeader>
            <AccordionBody className="flex flex-col m-0 p-0">
                {fees?.fees?.[cid] ?
                    <div className="">
                        <>
                            <Tooltip content="Refresh this section data!">
                                <Button className="p-0 m-0 float-right" variant="text" onClick={async () => {
                                    await getFeesByClassId(cid);
                                }}>
                                    <ArrowPathIcon className="icon" />
                                </Button>
                            </Tooltip>
                        </>
                        {
                            fees.fees[cid]
                                ?.map(([feeId, titleId, fee], findex) => (
                                    <span key={findex} className="w-full grid grid-cols-4 items-center">
                                        <span>
                                            <Checkbox checked={checked === feeId} onChange={() => {
                                                setChecked('');
                                            }} />
                                        </span>
                                        <span className="font-semibold">{fees?.titles?.[titleId]}</span>
                                        <span>Rs. {fee}</span>
                                        {/* action-buttons */}
                                        <span>
                                            <>
                                                <ActionButton action={editAction}
                                                    item={{ id: feeId, titleId, fee }}
                                                    onSelect={() => {
                                                        const { id, ...class_info } = fees?.classes[frIndex]?.[1] || { id: '' }; // except id;
                                                        onEditButtonClick(feeId, titleId, fee, class_info);
                                                    }} setSelected={() => null} />
                                            </>
                                            <>
                                                {/* <ActionButton action={deleteAction}
                                            item={{ id: feeId }}
                                            onSelect={() => {
                                                onDelete(cid, findex, feeId);
                                            }} setSelected={() => null} /> */}
                                            </>
                                        </span>
                                    </span>
                                ))
                        }
                    </div> :
                    <div></div>
                }
            </AccordionBody>
        </Accordion>
    )
}

export default FeeRow;