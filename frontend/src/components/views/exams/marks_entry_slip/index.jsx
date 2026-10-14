import Loader from "@/components/Loader";
import NotFound from "@/components/NotFound";
import ChooseClass from "@/components/inputs/ChooseClass";
import { ButtonsSecion, Section } from "@/components/sections";
import ReportHeader from "@/components/tables/ReportHeader";
import { selectAction } from "@/components/tables/actions";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { searchStudents } from "@/services/functions/students";
import { Button } from "@material-tailwind/react";
import { useEffect, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";

const schema = { students: [] };
function MarksEntrySlip() {
    const { user: { user } } = useAppContext();
    const [selectedClass, setSelectedClass] = useState('');
    schema["school"] = user?.profile?.school || user?.profile?.id;
    const [data, setData] = useState({ ...schema });
    const { fetching, statusHandler } = useRequestStatus();
    const slipRef = useRef(null);

    function onClassSelect(action, id, item) {
        setSelectedClass(item);
    }
    const printSlip = useReactToPrint({
        content: () => slipRef.current,
    });
    // 
    useEffect(() => {
        if (selectedClass?.class_info?.id) {
            (async () => {
                statusHandler.toggleFetching();
                let [, , _students] = await searchStudents({ ...selectedClass?.class_info || {} });
                _students = _students.reduce((acc, std, index) => {
                    acc.push({ name: std?.name, roll_no: index + 1 });
                    return acc;
                }, []);
                setData(state => ({ ...state, students: _students }));
                statusHandler.toggleFetching();
            })();
        }
    }, [selectedClass?.class_info?.id]);
    return (
        <>
            <ChooseClass selectedClass={selectedClass} actions={[selectAction]} onSelect={onClassSelect}>
                <ButtonsSecion>
                    <Button variant="outlined" onClick={printSlip}>Print</Button>
                </ButtonsSecion>
                {data?.students?.length > 0 ?
                    <div ref={slipRef} className="bg-white w-[82%] mx-auto py-4 px-[4rem]">
                        <ReportHeader hidden={false} />
                        <Section>
                            {/* The class is the one the slip was drawn up for, so
                                it is printed. It used to be a blank line like the
                                two beside it — and the class named on screen sits
                                outside the printed sheet — so a pile of slips off
                                the printer said nothing about whose they were
                                until someone wrote it on each by hand. Subject and
                                teacher are still written in: one list serves every
                                subject of the class. */}
                            <div className="flex flex-col sm:col-span-4">
                                <span>Class : <span className="font-semibold capitalize">{selectedClass?.classname || ''}</span></span>
                                <span className="h-2 border-b border-black"></span>
                            </div>
                            <div className="flex flex-col sm:col-span-4">
                                <span>Subject : </span>
                                <span className="h-2 border-b border-black"></span>
                            </div>
                            <div className="flex flex-col sm:col-span-4">
                                <span>Teacher : </span>
                                <span className="h-2 border-b border-black"></span>
                            </div>
                        </Section>
                        <table className="marks-slip w-full">
                            <thead>
                                <tr>
                                    <th>Roll No.</th>
                                    <th>Name of Student</th>
                                    <th>Marks</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(data?.students || []).map((std, si) => (
                                    <tr key={si}>
                                        <td>{std?.roll_no || ''}</td>
                                        <td className="capitalize">{std?.name || ''}</td>
                                        <td></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    :
                    <>
                        {fetching ? <Loader /> : <NotFound />}
                    </>
                }
            </ChooseClass>
        </>
    )
}

export default MarksEntrySlip;