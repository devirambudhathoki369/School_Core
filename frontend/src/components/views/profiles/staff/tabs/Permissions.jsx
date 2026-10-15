import FilterItem from "@/components/inputs/FilterItem";
import { PERMISSIONS, TESTED_PERMISSIONS } from "@/configs/permissions";
import { permissionAllowed } from "@/configs/moduleGates";
import { useAppContext } from "@/contexts/AppContext";
import { useStaffProfile } from "@/contexts/StaffProfile";
import ProfileButtons from "./ProfileButtons";

function PermissionsTab({ tab }) {
    const { data: { staff }, methods: { onChange }, view: { editingTab } } = useStaffProfile();
    // The school's modules: nothing is offered for one it does not have
    // (configs/moduleGates.js). What a staff member already holds there is
    // kept, and works again if the module is switched back on.
    const { user: { user } } = useAppContext();
    const profile = user?.profile;
    const allowEdit = editingTab === tab.key;
    return (
        <>
            <div className="flex flex-col">
                {
                    Object.entries(PERMISSIONS)
                        .filter(([category]) => permissionAllowed(category, null, profile))
                        .map(([category, _permissions], pci) => (
                            <PermissionsView category={category} permissions={_permissions} staff={staff}
                                allowEdit={allowEdit} onChange={onChange} profile={profile} key={pci} />
                        ))
                }
            </div>
            <ProfileButtons tab={tab} />
        </>
    )
}

function PermissionsView({ category, permissions, staff, allowEdit, onChange, profile }) {
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
                                        {TESTED_PERMISSIONS.includes(value) && permissionAllowed(null, value, profile) &&
                                            <FilterItem isDisabled={!allowEdit} onClick={onChange} label={name} value={value}
                                                name={'permission'} isSelected={staff?.permissions?.includes(value)} key={pi} />
                                        }
                                    </> :
                                    <>
                                        <PermissionsView key={pi} category={name} permissions={value} staff={staff}
                                            allowEdit={allowEdit} onChange={onChange} profile={profile} />
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