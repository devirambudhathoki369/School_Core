import { ButtonsSecion } from "@/components/sections";
import { useStaffProfile } from "@/contexts/StaffProfile";
import { Button } from "@material-tailwind/react";

export default function ProfileButtons({ tab }) {
    const { view: { editingTab, handleViewMode }, methods: { onReset, onUpdate } } = useStaffProfile();
    const allowEdit = editingTab === tab.key;
    function onClick() {
        allowEdit && onReset(tab.db_key);
        handleViewMode(allowEdit ? '' : tab.key);
    }
    return (
        <ButtonsSecion>
            <Button variant="outlined" onClick={onClick}>
                {allowEdit ? 'Cancel' : 'Edit'}
            </Button>
            {allowEdit &&
                <>
                    <Button variant="outlined" onClick={onUpdate}>Update</Button>
                </>
            }
        </ButtonsSecion>
    )
}