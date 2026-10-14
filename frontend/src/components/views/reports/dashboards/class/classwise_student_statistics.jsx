import BasicTable from "@/components/tables/BasicTable";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { __fetch } from "@/services/functions";
import { useEffect, useState } from "react";

const PATH = "/api/classwise_student_statistics";
const totalsSchema = { classname: "total", male_count: 0, female_count: 0, others_count: 0, total_count: 0 };
function ClasswiseStudentStatistics() {
    const { user: { user }, class: { classesBackup } } = useAppContext();
    const [classwiseStats, setClasswiseStats] = useState([]);
    const { fetching, statusHandler } = useRequestStatus();

    useEffect(() => {
        if (user?.profile?.id) {
            (async () => {
                const schoolId = user?.profile?.school || user?.profile?.id;
                statusHandler.toggleFetching();
                let _classwiseStats = await __fetch(PATH, { school: schoolId });
                if (_classwiseStats) {
                    const _totals = { ...totalsSchema };
                    _classwiseStats = classesBackup.reduce((acc, cls) => {
                        const [classname, { id: cid },] = cls;
                        const { male_count, female_count, others_count, total_count } = _classwiseStats?.[cid] || {};
                        acc.push({
                            classname,
                            male_count, female_count, others_count: others_count || '',
                            total_count,
                        });
                        // 
                        _totals.male_count += (male_count || 0);
                        _totals.female_count += (female_count || 0);
                        _totals.others_count += (others_count || 0);
                        _totals.total_count += (total_count || 0);
                        return acc;
                    }, []);
                    _classwiseStats.push({ ..._totals });
                    setClasswiseStats(_classwiseStats);
                }
                statusHandler.toggleFetching();
            })();
        }
    }, [user?.profile?.id]);

    return (
        <>
            <BasicTable name={"Classwise students count"} data={classwiseStats || []} columns={[
                ['classname'],
                ['male_count', "Total Male"],
                ['female_count', "Total Female"],
                ['others_count', "Total Others"],
                ['total_count', "Total"]
            ]} loading={fetching} highLightLast={true} print={true} allowExport onSelect={() => null} showSelected={false} />
        </>
    )
}

export default ClasswiseStudentStatistics;