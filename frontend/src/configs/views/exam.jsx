import dynamic from "next/dynamic";

const ManageExams = dynamic(() => import("@/components/views/exams/setups/exam"));
const ManageExamSchedules = dynamic(() => import("@/components/views/exams/setups/schedule"));
const ManageGradingRules = dynamic(() => import("@/components/views/exams/setups/grading_rules"));
const OptionalSubjectAssignment = dynamic(() => import(/* webpackChunkName: "marks-entry" */"@/components/views/exams/optional_subject_assignment"));
const MarksEntry = dynamic(() => import(/* webpackChunkName: "marks-entry" */"@/components/views/exams/setups/marks_entry"));
const MarksEntrySlip = dynamic(() => import(/* webpackChunkName: "marks-entry" */"@/components/views/exams/marks_entry_slip"));
const ExtraActivitiesEntry = dynamic(() => import(/* webpackChunkName: "marks-entry" */"@/components/views/exams/extra_activities_entry"));
const EntryCards = dynamic(() => import("@/components/views/exams/entry_cards"));
const SeatPlan = dynamic(() => import("@/components/views/exams/seat_plan"));
const SeatPlanOld = dynamic(() => import("@/components/views/exams/seat_plan_old"));
const ResultPublish = dynamic(() => import("@/components/views/exams/result_publish"));
const CharacterCertificateView = dynamic(() => import("@/components/views/exams/character_certificate"));
const CharacterCertificateListView = dynamic(() => import("@/components/views/exams/character_certificate/list_view"));
// 
const NSClassResult = dynamic(() => import(/* webpackChunkName: "results-ns" */"@/components/views/exams/reports/number_system/class_result"));
const NSTerminalIndividualResult = dynamic(() => import(/* webpackChunkName: "results-ns" */"@/components/views/exams/reports/number_system/terminal_individual_result"));
const NSFinalClassResult = dynamic(() => import(/* webpackChunkName: "results-ns" */"@/components/views/exams/reports/number_system/class_result_final"));
const NSFinalIndividualResult = dynamic(() => import(/* webpackChunkName: "results-ns" */"@/components/views/exams/reports/number_system/terminal_individual_result_final"));
const LGSClassResult = dynamic(() => import(/* webpackChunkName: "results-lgs" */"@/components/views/exams/reports/letter_system/class_result"));
const LGSTerminalIndividualResult = dynamic(() => import(/* webpackChunkName: "results-lgs" */"@/components/views/exams/reports/letter_system/terminal_individual_result"));
const LGSFinalClassResult = dynamic(() => import(/* webpackChunkName: "results-lgs" */"@/components/views/exams/reports/letter_system/class_result_final"));
const LGSFinalIndividualResult = dynamic(() => import(/* webpackChunkName: "results-lgs" */"@/components/views/exams/reports/letter_system/terminal_individual_result_final"));
const CombinedMarksheet = dynamic(() => import(/* webpackChunkName: "results-combined" */"@/components/views/exams/reports/marksheet_combined"));
const CombinedMarksheetFinal = dynamic(() => import(/* webpackChunkName: "results-combined" */"@/components/views/exams/reports/marksheet_combined/final"));

const examViews = {
    'exams.setup': () => <ManageExams />,
    'exams.schedule-setup': () => <ManageExamSchedules />,
    'exams.grading-rules-setup': () => <ManageGradingRules />,
    'exams.optional-subject-assignment': () => <OptionalSubjectAssignment />,
    'exams.marks-entry': () => <MarksEntry />,
    'exams.marks-entry-slip': () => <MarksEntrySlip />,
    'exams.extra-activities-entry': () => <ExtraActivitiesEntry />,
    'exams.entry-cards': () => <EntryCards />,
    'exams.seat-plan': () => <SeatPlan />,
    'exams.seat-plan-old': () => <SeatPlanOld />,
    'exams.publish-results': () => <ResultPublish />,
    'exams.character-certificate': () => <CharacterCertificateView />,
    'exams.character-certificates': () => <CharacterCertificateListView />,
    // number-system;
    'exams.results.number-system.class-result': () => <NSClassResult />,
    'exams.results.number-system.marksheet': () => <NSTerminalIndividualResult />,
    'exams.results.number-system.final.class-result': () => <NSFinalClassResult />,
    'exams.results.number-system.final.marksheet': () => <NSFinalIndividualResult />,
    // letter grading system;
    'exams.results.letter-grading-system.class-result': () => <LGSClassResult />,
    'exams.results.letter-grading-system.gradesheet': () => <LGSTerminalIndividualResult />,
    'exams.results.letter-grading-system.final.class-result': () => <LGSFinalClassResult />,
    'exams.results.letter-grading-system.final.gradesheet': () => <LGSFinalIndividualResult />,
    // 
    'exams.results.combined-marksheet': () => <CombinedMarksheet />,
    'exams.results.final-combined-marksheet': () => <CombinedMarksheetFinal />,
}

export default examViews;