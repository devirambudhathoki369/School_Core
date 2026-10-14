import dynamic from "next/dynamic";

// Every page is dynamically imported: the hostel is a per-school module, so for
// most schools none of this code should ever be fetched at all.
const HostelDashboard = dynamic(() => import("@/components/views/hostel/dashboard"));
const HostelSetup = dynamic(() => import("@/components/views/hostel/setup"));
const HostelRooms = dynamic(() => import("@/components/views/hostel/rooms"));
const HostelResidents = dynamic(() => import("@/components/views/hostel/residents"));
const HostelAttendance = dynamic(() => import("@/components/views/hostel/attendance"));
const HostelLeaves = dynamic(() => import("@/components/views/hostel/leaves"));
const HostelVisitors = dynamic(() => import("@/components/views/hostel/visitors"));
const HostelComplaints = dynamic(() => import("@/components/views/hostel/complaints"));
const HostelMess = dynamic(() => import("@/components/views/hostel/mess"));
const HostelDiscipline = dynamic(() => import("@/components/views/hostel/discipline"));
const HostelReports = dynamic(() => import("@/components/views/hostel/reports"));

// NOTE: these keys are gated as a group by `configs/moduleGates.js` — the whole
// `hostel.*` prefix is dropped from the view map for a school without the
// module, so none of these paths resolve for them even by hand-typed URL.
const hostelViews = {
    "hostel.dashboard": () => <HostelDashboard />,
    "hostel.setup": () => <HostelSetup />,
    "hostel.rooms": () => <HostelRooms />,
    "hostel.residents": () => <HostelResidents />,
    "hostel.attendance": () => <HostelAttendance />,
    "hostel.leaves": () => <HostelLeaves />,
    "hostel.visitors": () => <HostelVisitors />,
    "hostel.complaints": () => <HostelComplaints />,
    "hostel.mess": () => <HostelMess />,
    "hostel.discipline": () => <HostelDiscipline />,
    "hostel.reports": () => <HostelReports />,
};

export default hostelViews;
