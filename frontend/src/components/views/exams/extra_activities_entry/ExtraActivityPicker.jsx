import FilterItem from "@/components/inputs/FilterItem";
import Checkbox from "@/components/inputs/Checkbox";
import { useEffect } from "react";
import { ButtonsSecion } from "@/components/sections";

const NAME = "extra_activities";
function ExtraActivityPicker({ activities, data, previousData, onSelect, allActivities: { pickedAllActivities, setPickedAllActivities }, onSelectAll }) {
    function handleSelectAll() {
        if (pickedAllActivities) {
            const _activities = activities.reduce((acc, act) => {
                if (!previousData?.includes(act.id)) acc.push(act.id);
                return acc;
            }, []);
            onSelectAll({ name: NAME, value: _activities });
        } else {
            onSelectAll({ name: NAME, value: [] });
        }
    }
    function onActivitySelect({ name, value }) {
        let _activities = new Set(data?.[NAME] || []);
        if (_activities.has(value)) _activities.delete(value);
        else _activities.add(value);
        return onSelect({ name, value: Array.from(_activities) });
    }
    // 
    useEffect(() => {
        handleSelectAll();
    }, [pickedAllActivities]);
    // 
    return (
        <div className="flex flex-col items-start">
            <div className="flex flex-wrap">
                {activities.map(activity => (
                    <FilterItem key={activity.id} name={NAME}
                        // TODO: FIX THIS; keep isSelected, remove selectedOption;
                        isDisabled={previousData?.includes(activity.id)}
                        selectedOption={data?.[NAME]?.includes(activity.id) ? activity.id : null}
                        label={activity.name} value={activity.id} onClick={onActivitySelect} />
                ))}
            </div>
            <ButtonsSecion>
                <Checkbox disabled={activities?.length < 1} onClick={() => {
                    setPickedAllActivities(state => !state);
                }} checked={pickedAllActivities} text={"Select all activities?"} />
            </ButtonsSecion>
        </div>
    )
}

export default ExtraActivityPicker;