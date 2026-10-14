import BasicTable from "@/components/tables/BasicTable";
import { getAcademicYears } from "@/services/functions/fiscalYear";
import { Tab, TabPanel, Tabs, TabsBody, TabsHeader } from "@material-tailwind/react";
import AcademicYearMapping from "./AcademicYearMapping";
import AttentionBox from "@/components/AttentionBox";
import Loader from "@/components/Loader";
import { useAppContext } from "@/contexts/AppContext";
import { useEffect, useState } from "react";

/**
 * Academic years, as the school sees them: READ-ONLY.
 *
 * The create form that used to sit on top of this table is gone. A school does
 * not create an academic year any more — it moves into the next one through
 * `Manage ▸ Academic year closing`, which creates the year itself and rolls the
 * balances into it in one transaction. Anything else (a first year, a fix, a
 * parallel calendar) is a superadmin job.
 *
 * The reason is not tidiness. A hand-typed year is unmapped and invisible to
 * the closing flow, so it accumulated silently: two `SCHOOL 2083` rows at one
 * school with the real data on only one of them, years ending 03-31 in a month
 * with 32 days. Every one of those had to be repaired directly in the database.
 */
function AcademicYearList() {
    const { user: { user } } = useAppContext();
    const [years, setYears] = useState([]);
    const [fetching, setFetching] = useState(true);

    useEffect(() => {
        const school = user?.profile?.school || user?.profile?.id;
        if (!school) return;
        (async () => {
            setFetching(true);
            // `all` = open AND closed, so the page shows the school's full
            // history rather than only the running year.
            const data = await getAcademicYears(school, '', 'all');
            setYears(Array.isArray(data) ? data : []);
            setFetching(false);
        })();
    }, [user?.profile]);

    return (
        <>
            <AttentionBox title={NOTE.title} description={NOTE.description} />
            {fetching ? <Loader /> :
                <BasicTable name={"Academic Years"} data={years} columns={[
                    ['name'],
                    ['start_date', 'start date'],
                    ['end_date', 'end date'],
                    ['status']
                ]} onSelect={() => null} showSelected={false} />
            }
        </>
    )
}

function AcademicYearManagementView() {

    return (
        <div className={`w-full p-3 px-0 rounded-md !m-0`}>
            <Tabs value='academic-year-setup'>
                <TabsHeader className="border-b-2 border-blue-gray-50 p-0 bg-transparent"
                    indicatorProps={{
                        className: "bg-transparent border-b-2 border-gray-900 shadow-none rounded-none",
                    }}>
                    <Tab className="bg-table-header font-semibold" value={'academic-year-setup'}>Academic Years</Tab>
                    <Tab className="bg-table-header font-semibold" value={'academic-year-mapping'}>Academic Year Mapping</Tab>
                </TabsHeader>
                <TabsBody animate={{
                    initial: { y: 250 },
                    mount: { y: 0 },
                    unmount: { y: 250 },
                }}>
                    <div>
                        <TabPanel value={'academic-year-setup'}>
                            <AcademicYearList />
                        </TabPanel>
                        <TabPanel value={'academic-year-mapping'}>
                            <AcademicYearMapping />
                        </TabPanel>
                    </div>
                </TabsBody>
            </Tabs>
        </div>
    )
}

const NOTE = {
    title: "Academic years are set up centrally",
    description: `Your next academic year is created for you when you close the running one
    — Manage > Academic year closing.
        Need a year added or corrected? Contact support.`,
};

export default AcademicYearManagementView;
