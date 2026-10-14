import { useAppContext } from "@/contexts/AppContext";
import { Tab, TabPanel, Tabs, TabsBody, TabsHeader } from "@material-tailwind/react";

import Courses from "./Courses";
import ManageSubjectsClasswise from "./ClasswiseSubjects";
import hasPermission from "@/methods/hasPermission";
import { PERMISSIONS } from "@/configs/permissions";

const VIEWS = [
    {
        value: 'course-setup',
        label: 'Course Setup',
        panel: Courses
    },
    {
        value: 'classwise-subject-setup',
        label: 'Classwise Subject Setup',
        panel: ManageSubjectsClasswise
    }
]

function ManageCoursesSubjects() {
    const { user: { user } } = useAppContext();
    // 
    const AllowedViews = [],
        hasPermissionToPage = hasPermission(user, PERMISSIONS.MANAGE.COURSES_SUBJECTS_PAGE);
    (hasPermissionToPage && hasPermission(user, PERMISSIONS.MANAGE.COURSES)) && AllowedViews.push(VIEWS[0]);
    (hasPermissionToPage && hasPermission(user, PERMISSIONS.MANAGE.SUBJECTS)) && AllowedViews.push(VIEWS[1]);
    // 
    return (
        <div className={`w-full p-3 px-0 rounded-md !m-0 shadow-default`}>
            <Tabs value={VIEWS[1].value}>
                <TabsHeader className="border-b-2 border-blue-gray-50 p-0 bg-transparent"
                    indicatorProps={{
                        className: "bg-transparent border-b-2 border-gray-900 shadow-none rounded-none",
                    }}>
                    {
                        AllowedViews.map((view, vi) => (
                            <Tab className="bg-table-header font-semibold" key={vi} value={view.value} onClick={(e) => {
                                // console.log(e.target);
                            }}>{view.label}</Tab>
                        ))
                    }
                </TabsHeader>
                <TabsBody animate={{
                    initial: { y: 250 },
                    mount: { y: 0 },
                    unmount: { y: 250 },
                }}>
                    <div>
                        {
                            AllowedViews.map((view, vi) => {
                                const PANEL = view.panel;
                                return (
                                    <TabPanel key={vi} value={view.value}>
                                        <PANEL key={view.value} />
                                    </TabPanel>
                                )
                            })
                        }
                    </div>
                </TabsBody>
            </Tabs>
        </div>
    )
}

export default ManageCoursesSubjects;