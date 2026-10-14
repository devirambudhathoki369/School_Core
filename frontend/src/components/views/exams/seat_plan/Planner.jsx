import { useEffect, useRef, useState } from "react";

import { Section } from "@/components/sections";
import { SearchInput } from "@/components/inputs";
import NotFound from "@/components/NotFound";
import { getSeatPlanRooms, getSeatPlans } from "@/services/functions/exams/seatPlan";
import Steps, { STEP_ROOMS, STEP_SEATING } from "./Steps";
import RoomsSetup from "./RoomsSetup";
import Seating from "./Seating";

const NO_EXAM = { value: "", name: "" };

/**
 * The seat plan page without the app around it. A school does it in two steps,
 * and the page is those two steps:
 *
 *   1. Rooms          add the rooms and their benches — once, no exam
 *   2. Seat students  choose the exam, send classes to the rooms, print
 *
 * Everything arrives as props, so it holds no context of its own.
 *
 *   exams      the exams that can be seated: [{ name, value }] (null = loading)
 *   examLabel  the label of the exam picker
 */
function Planner({ schoolId, classesBackup, updateNotification, exams, examLabel }) {
    // the school's rooms and the exams already seated; null while loading
    const [rooms, setRooms] = useState(null);
    const [plans, setPlans] = useState(null);
    const [step, setStep] = useState(null);
    const [exam, setExam] = useState(NO_EXAM);
    const alive = useRef(true);
    // the exam is chosen for the school only until the school chooses one
    const examPreset = useRef(false);

    async function refresh() {
        const [roomList, planList] = await Promise.all([getSeatPlanRooms(schoolId), getSeatPlans(schoolId)]);
        if (!alive.current) return roomList;
        setRooms(roomList);
        setPlans(planList);
        return roomList;
    }

    useEffect(() => {
        alive.current = true;
        if (schoolId) {
            (async () => {
                const roomList = await refresh();
                // rooms first: a school with none starts there, everyone else
                // lands where the work is
                if (alive.current) setStep((current) => current || (roomList.length === 0 ? STEP_ROOMS : STEP_SEATING));
            })();
        }
        return () => { alive.current = false; };
    }, [schoolId]);

    // Save the school a click: open on the newest exam it has already seated,
    // or on the only exam there is.
    useEffect(() => {
        if (examPreset.current || exam.value || !plans || !exams) return;
        const seatedBefore = plans.map((p) => exams.find((e) => `${e.value}` === `${p.exam}`)).find(Boolean);
        const pick = seatedBefore || (exams.length === 1 ? exams[0] : null);
        examPreset.current = true;
        if (pick) setExam({ value: pick.value, name: pick.name });
    }, [plans, exams]);

    const seats = (rooms || []).reduce((n, r) => n + r.benches * r.seats_per_bench, 0);
    const current = (plans || []).find((p) => `${p.exam}` === `${exam.value}`);
    const status = rooms && plans && {
        [STEP_ROOMS]: rooms.length
            ? { text: `${rooms.length} room${rooms.length === 1 ? "" : "s"} · ${seats} seats`, done: true }
            : { text: "No rooms yet — start here", done: false },
        [STEP_SEATING]: current
            ? { text: `${current.seated} student${current.seated === 1 ? "" : "s"} seated for this exam`, done: current.seated > 0 }
            : { text: rooms.length ? "Not seated yet" : "After the rooms are added", done: false },
    };

    return (
        // `relative`: anything absolutely positioned inside the page (a picker's
        // internals, a hidden label) is then placed against the page's own box,
        // which scrolls with the content — never against the window.
        <div className="seat-plan-page relative flex flex-col gap-y-3">
            <Section title="Seat Plan"
                description="First add the rooms. Then, for an exam, send the classes to the rooms — the students are seated for you and the room charts are ready to print.">
                <Steps value={step} onChange={setStep} status={status} />
                {step === STEP_SEATING &&
                    <>
                        <SearchInput input={{ name: "exam", label: examLabel || "Exam", options: exams || [] }}
                            value={exam.value}
                            onChange={({ value }) => {
                                examPreset.current = true;
                                const picked = (exams || []).find((e) => `${e.value}` === `${value}`);
                                setExam(picked ? { value: picked.value, name: picked.name } : NO_EXAM);
                            }} />
                        <p className="sm:col-span-8 pb-2 text-[13px] leading-snug text-[var(--ink-600)]">
                            {exam.value
                                ? "Students are seated for this exam, and its name is printed on the room charts."
                                : "Choose the exam the students are being seated for."}
                        </p>
                    </>}
            </Section>

            {step === STEP_ROOMS &&
                <RoomsSetup rooms={rooms} schoolId={schoolId} classesBackup={classesBackup} updateNotification={updateNotification}
                    onChanged={refresh} onNext={() => setStep(STEP_SEATING)} />}
            {step === STEP_SEATING && (!exam.value
                ? <NotFound error="Pick an exam to seat its students." />
                : <Seating exam={exam.value} examName={exam.name} schoolId={schoolId}
                    classesBackup={classesBackup} updateNotification={updateNotification}
                    plans={plans} onChanged={refresh} onGoToRooms={() => setStep(STEP_ROOMS)} />)}
        </div>
    );
}

export default Planner;
