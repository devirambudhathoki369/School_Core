import { Tab, TabPanel, Tabs, TabsBody, TabsHeader } from "@material-tailwind/react";
import { GradingRulesForm } from "./GradingRulesForm";
import { useAppContext } from "@/contexts/AppContext";

// MUST MATCH WITH `RULES_TYPES` IN `backend/main/models/exams/GradingRules`
const GRADING_RULE_TYPES = {
    number: 1,
    grading: 2,
    division: 4 // actually has to be 3 but mistakenly applied as 4 in db_table;
};

function ManageGradingRules() {

    return (
        <div className={`w-full p-3 px-0 rounded-md !m-0`}>
            <Tabs value='number-system-rules'>
                <TabsHeader className="border-b-2 border-blue-gray-50 p-0 bg-transparent"
                    indicatorProps={{
                        className: "bg-transparent border-b-2 border-gray-900 shadow-none rounded-none",
                    }}>
                    <Tab className="bg-table-header font-semibold" value={'number-system-rules'}>Number System rules</Tab>
                    <Tab className="bg-table-header font-semibold" value={'grading-system-rules'}>Letter Grading System rules</Tab>
                    <Tab className="bg-table-header font-semibold" value={'division-rules'}>Division rules</Tab>
                </TabsHeader>
                <TabsBody animate={{
                    initial: { y: 250 },
                    mount: { y: 0 },
                    unmount: { y: 250 },
                }}>
                    <div>
                        <TabPanel value={'number-system-rules'}>
                            <GradingRulesForm type={GRADING_RULE_TYPES.number}
                                name={"Number System Rules"} description={"0-30 = Poor or 30-50 = Need more effort"} />
                        </TabPanel>
                        <TabPanel value={'grading-system-rules'}>
                            <GradingRulesForm type={GRADING_RULE_TYPES.grading}
                                name={"Letter Grading System Rules"} description={"0-1 = Poor or 1-2 = Need more effort"} />
                        </TabPanel>
                        <TabPanel value={'division-rules'}>
                            <GradingRulesForm type={GRADING_RULE_TYPES.division}
                                name={"Division Rules"} description={""} />
                        </TabPanel>
                    </div>
                </TabsBody>
            </Tabs>
        </div>
    )
}

export { GRADING_RULE_TYPES };
export const gradingRulesSchema = { school: '', type: '', rules: [] };
export const ruleSchema = { min: '', max: '', remarks: '' };
export default ManageGradingRules;