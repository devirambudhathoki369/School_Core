import { useRouter } from "next/router";
import {
    AcademicCapIcon, CheckCircleIcon, ChevronRightIcon, CurrencyRupeeIcon,
    IdentificationIcon, LockClosedIcon, RectangleGroupIcon, UserGroupIcon,
} from "@heroicons/react/24/outline";
import { useAppContext } from "@/contexts/AppContext";
import { navigatePortal, portalPath } from "@/methods/portalRoutes";

function Step({ number, title, description, label, icon: Icon, state = "ready", onOpen }) {
    const complete = state === "complete";
    const locked = state === "locked";
    return (
        <article className={`rounded-xl border bg-white p-4 shadow-sm transition
            ${complete ? "border-emerald-200" : locked ? "border-gray-200 opacity-70" : "border-blue-200 hover:border-blue-400 hover:shadow-md"}`}>
            <div className="flex items-start gap-3">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl
                    ${complete ? "bg-emerald-50 text-emerald-600" : locked ? "bg-gray-100 text-gray-400" : "bg-blue-50 text-blue-600"}`}>
                    {complete ? <CheckCircleIcon className="h-6 w-6" /> : locked ? <LockClosedIcon className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Step {number}</span>
                        {label && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">{label}</span>}
                    </div>
                    <h3 className="mt-1 text-base font-semibold text-gray-900">{title}</h3>
                    <p className="mt-1 text-sm leading-5 text-gray-600">{description}</p>
                    <button type="button" disabled={locked} onClick={onOpen}
                        className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-blue-700 disabled:cursor-not-allowed disabled:text-gray-400">
                        {locked ? "Complete the previous step first" : complete ? "Review" : "Open step"}
                        {!locked && <ChevronRightIcon className="h-4 w-4" />}
                    </button>
                </div>
            </div>
        </article>
    );
}

export default function SetupGuide() {
    const router = useRouter();
    const {
        user: { user },
        fiscalYear: { year },
        class: { classesBackup, classesLoaded },
    } = useAppContext();
    const role = user?.role || "admin";
    const hasYear = !!year?.academic_year;
    const hasClasses = classesLoaded && classesBackup.length > 0;
    const open = (view) => navigatePortal(router, portalPath(role, view));

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-1 sm:p-3">
            <section className="rounded-2xl border border-teal-100 bg-teal-50 p-5 sm:p-7">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">Getting started</p>
                <h1 className="mt-2 text-2xl font-bold text-gray-900">Set up your school</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
                    Follow this order once. Optional steps can be skipped, and the system selects the current year automatically.
                    After setup, use the individual menu pages only when something changes.
                </p>
            </section>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Step number="1" title="Confirm the academic year" icon={AcademicCapIcon}
                    state={hasYear ? "complete" : "ready"} label="Automatic"
                    description={hasYear ? `Current academic year: ${year.academic_year_name}.` : "The latest open year is selected automatically. Review it only if it looks wrong."}
                    onOpen={() => open("manage.academic-year")} />
                <Step number="2" title="Add sections, if you use them" icon={RectangleGroupIcon} label="Optional"
                    description="Add A, B, Morning, or similar divisions. Skip this for a school that does not divide classes."
                    onOpen={() => open("manage.sections")} />
                <Step number="3" title="Create classes" icon={AcademicCapIcon}
                    state={!hasYear ? "locked" : hasClasses ? "complete" : "ready"}
                    description={hasClasses ? `${classesBackup.length} ${classesBackup.length === 1 ? "class is" : "classes are"} ready.` : "Create the grades or programmes students will join. Classes unlock subjects, fees, attendance, and enrollment."}
                    onOpen={() => open("manage.classes")} />
                <Step number="4" title="Add subjects" icon={RectangleGroupIcon}
                    state={hasClasses ? "ready" : "locked"}
                    description="Choose a class and add only the subjects taught there. Course/program setup is needed only for higher education and +2 streams."
                    onOpen={() => open("manage.courses-subjects")} />
                <Step number="5" title="Set up fees" icon={CurrencyRupeeIcon} label="Can be done later"
                    state={hasClasses ? "ready" : "locked"}
                    description="Create fee titles and amounts for each class. Skip this until billing is ready."
                    onOpen={() => open("manage.fees")} />
                <Step number="6" title="Enroll people" icon={UserGroupIcon}
                    state={hasClasses ? "ready" : "locked"}
                    description="Add students and staff after the class structure is ready. You can return to setup at any time."
                    onOpen={() => open("enrollment.student")} />
            </div>

            <section className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
                <IdentificationIcon className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
                <p><strong className="text-gray-800">Not required now:</strong> bus stations, extra activities, batches, users, and the academic calendar are optional features. Configure them only when your school uses them.</p>
            </section>
        </div>
    );
}
