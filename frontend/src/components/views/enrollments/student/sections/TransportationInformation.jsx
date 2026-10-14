import { Section } from "@/components/sections";
import BusStationInput from "@/components/inputs/BusStationInput";
import { TextInput } from "@/components/inputs";
import { useEnrollmentContext } from "@/contexts/EnrollmentContext";

function TransportationInformationSection() {
    const { student, errors, methods } = useEnrollmentContext();
    return (
        <Section title="Transportation Information">
            <BusStationInput input={{ label: 'Bus Station', name: 'bus_station' }} error={errors?.bus_station}
                value={student?.bus_station} {...methods} />
            <TextInput input={{ label: 'Start Date (BS)', name: 'start_date' }} error={errors?.start_date}
                value={student?.start_date} {...methods} />
        </Section>
    )
}

export default TransportationInformationSection;