import { Tab, TabPanel, Tabs, TabsBody, TabsHeader } from "@material-tailwind/react";

import FeeSetup from "./FeeSetup";
import FeeTitleSetup from "./FeeTitleSetup";

function ManageFees() {
    // No `fixed`, and no `viewWidth`. This panel used to be pinned to the
    // viewport and sized `md:w-[75%]` of it, while sitting inside the content
    // column that already starts after the sidebar — so it ran past the right
    // edge of the page, and being out of flow it ignored `.viewc` entirely. It
    // is an ordinary block that fills its column; `.viewc` does the scrolling.
    return (
        <div className="w-full p-3 px-0 rounded-md !m-0">
            <Tabs value='fee-setup'>
                <TabsHeader className="border-b-2 border-blue-gray-50 p-0 bg-transparent"
                    indicatorProps={{
                        className: "bg-transparent border-b-2 border-gray-900 shadow-none rounded-none",
                    }}>
                    <Tab className="bg-table-header font-semibold" value={'fee-title-setup'}>Fee Title Setup</Tab>
                    <Tab className="bg-table-header font-semibold" value={'fee-setup'}>Fee Setup</Tab>
                </TabsHeader>
                <TabsBody animate={{
                    initial: { y: 250 },
                    mount: { y: 0 },
                    unmount: { y: 250 },
                }}>
                    <div>
                        <TabPanel value={'fee-title-setup'} className="max-h-[85vh] !overflow-y-auto">
                            <FeeTitleSetup />
                        </TabPanel>
                        <TabPanel value={'fee-setup'} className=" max-h-[85vh] !overflow-y-auto">
                            <FeeSetup />
                        </TabPanel>
                    </div>
                </TabsBody>
            </Tabs>
        </div>
    )
}

export default ManageFees;