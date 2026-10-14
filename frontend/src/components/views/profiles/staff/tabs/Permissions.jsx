import FilterItem from "@/components/inputs/FilterItem";
import { PERMISSIONS, TESTED_PERMISSIONS } from "@/configs/permissions";
import { useStaffProfile } from "@/contexts/StaffProfile";
import ProfileButtons from "./ProfileButtons";

function PermissionsTab({ tab }) {
    const { data: { staff }, methods: { onChange }, view: { editingTab } } = useStaffProfile();
    const allowEdit = editingTab === tab.key;
    return (
        <>
            <div className="flex flex-col">
                {
                    Object.entries(PERMISSIONS)
                        .map(([category, _permissions], pci) => (
                            <PermissionsView category={category} permissions={_permissions} staff={staff}
                                allowEdit={allowEdit} onChange={onChange} key={pci} />
                        ))
                }
            </div>
            <ProfileButtons tab={tab} />
        </>
    )
}

function PermissionsView({ category, permissions, staff, allowEdit, onChange }) {
    return (
        <div className="border-b border-gray-600 mb-2 p-2">
            <h1 className="mb-1 ml-2 font-bold">{category}</h1>
            <div className={`flex flex-wrap`}>
                {
                    Object.entries(permissions)
                        .map(([name, value], pi) => (
                            <>
                                {typeof value === "number" ?
                                    <>
                                        {TESTED_PERMISSIONS.includes(value) &&
                                            <FilterItem isDisabled={!allowEdit} onClick={onChange} label={name} value={value}
                                                name={'permission'} isSelected={staff?.permissions?.includes(value)} key={pi} />
                                        }
                                    </> :
                                    <>
                                        <PermissionsView key={pi} category={name} permissions={value} staff={staff}
                                            allowEdit={allowEdit} onChange={onChange} />
                                    </>
                                }
                            </>
                        ))
                }
            </div>
        </div>
    )
}

export default PermissionsTab;