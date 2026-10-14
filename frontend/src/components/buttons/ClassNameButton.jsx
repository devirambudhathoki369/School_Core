import ActionButton from "./ActionButton";

function ClassnameButton({ cls, actions, onSelect, selectedClassId, hideSections = false }) {
    const [classname, class_info,] = cls;
    const isSelected = selectedClassId === class_info.id;
    const selectedBG = isSelected ? 'bg-teal-400 font-bold' : 'bg-teal-200';

    return (
        <>{(!hideSections || (hideSections && !class_info?.section)) &&
            <span className={`flex gap-x-4 items-center justify-between rounded-md cursor-pointer capitalize font-semibold
            ${selectedBG}`}>
                <span className={`py-2 px-4`}>{classname}</span>
                {
                    actions?.map((action, ai) => (
                        <ActionButton selected={(selectedClassId === class_info.id) || false} key={ai} action={action}
                            item={{ classname, class_info }} onSelect={onSelect} setSelected={() => null} />
                    ))
                }
            </span>
        }
        </>
    )
}

export default ClassnameButton;