import { useEffect, useRef, useState } from "react"
import { isWithinNepaliRange, parseNepaliDate } from "./methods"
import {
    ChevronLeftIcon,
    ChevronRightIcon,
    CalendarIcon,
    ChevronDownIcon,
    ChevronUpIcon,
} from "@heroicons/react/24/outline";
import { days, nepaliMonths } from "./constants";
import EventsView from "./EventsView";
import { Button } from "@material-tailwind/react";
import PreviousButton from "../buttons/PreviousButton";
import { useAppContext } from "@/contexts/AppContext";
import { __fetch } from "@/services/functions";

const API_PATH = "/api/calendar_events";

function Calendar() {
    const { user: { user } } = useAppContext();
    const [currentNepaliDate, setCurrentNepaliDate] = useState(parseNepaliDate(user?.today));
    const [nepaliCalendar, setNepaliCalendar] = useState({});
    const [expandedMonths, setExpandedMonths] = useState([currentNepaliDate.month]);
    const [events, setEvents] = useState([]);
    const [selectedDate, setSelectedDate] = useState(null);
    const [selectedDateEvents, setSelectedDateEvents] = useState([]);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [showAllMonths, setShowAllMonths] = useState(false);
    // 
    const [expandedDescriptions, setExpandedDescriptions] = useState([]);

    const toggleDescriptionExpand = (eventId) => {
        setExpandedDescriptions((prev) =>
            prev.includes(eventId) ? prev.filter((id) => id !== eventId) : [...prev, eventId],
        );
    }

    const currentMonthRef = useRef(null);
    const handleCurrentMonthRef = (node) => {
        if (node) {
            currentMonthRef.current = node; // Store ref for later use
            scrollToCurrentMonth();
        } else {
            currentMonthRef.current = null; // Clear ref when unmounted
        }
    };
    const scrollToCurrentMonth = () => {
        if (currentMonthRef.current) {
            currentMonthRef.current.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
            });
        }
    };

    const handleDateClick = (year, month, day) => {
        const dateStr = `${year}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
        setSelectedDate(dateStr);

        const dateEvents = events
            .filter((event) => isWithinNepaliRange(dateStr, event.start_date, event.end_date));

        setSelectedDateEvents(dateEvents);
        setDrawerOpen(true);
        setExpandedDescriptions([]);
    }

    const toggleMonth = (month) => {
        if (expandedMonths.includes(month)) {
            setExpandedMonths(expandedMonths.filter((m) => m !== month));
        } else {
            setExpandedMonths([...expandedMonths, month]);
        }
    }

    const toggleAllMonths = () => {
        if (showAllMonths) {
            setExpandedMonths([currentNepaliDate.month]);
            scrollToCurrentMonth();
        } else {
            setExpandedMonths(Array.from({ length: 12 }, (_, i) => i + 1));
        }
        setShowAllMonths(state => !state);
    }

    const prevYear = () => {
        setCurrentNepaliDate((prev) => ({
            ...prev,
            year: prev.year - 1,
        }));
    }

    const nextYear = () => {
        setCurrentNepaliDate((prev) => ({
            ...prev,
            year: prev.year + 1,
        }));
    }

    const getNepaliMonthDays = (year, month) => {
        const daysInMonth = nepaliCalendar?.calendar?.[year]?.[month] || 30;
        const daysInPreviousMonth = month === 1 ? 0 : nepaliCalendar?.calendar?.[year]?.[month - 1];
        return Array.from({ length: daysInMonth - daysInPreviousMonth }, (_, i) => i + 1)
    }

    function _days_before_year(year) {
        if (year === nepaliCalendar?.MINYEAR) return 0;
        return nepaliCalendar?.DAYS_BEFORE_YEAR?.[year - nepaliCalendar?.MINYEAR - 1] || 0;
    }
    function _days_before_month(year, month) {
        if (month === 1) return 0;
        return nepaliCalendar.calendar?.[year]?.[month - 1] || 0;
    }

    function toordinal(year, month, day) {
        /* year, month, day -> ordinal, considering 1975-Bai-01 as day 1. */
        return _days_before_year(year) + _days_before_month(year, month) + day;
    }

    const getStartingDay = (year, month, day) => {
        const ordinal = toordinal(year, month, day);
        const weekDay = (ordinal + 5) % 7;
        // console.log(month, weekDay, 6 - weekDay);
        return weekDay;
    }

    const hasEventsForDay = (year, month, day) => {
        const dateStr = `${year}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
        return events.some((event) => isWithinNepaliRange(dateStr, event.start_date, event.end_date));
    }

    const getEventColorsForDay = (year, month, day) => {
        const dateStr = `${year}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
        return events
            .filter((event) => isWithinNepaliRange(dateStr, event.start_date, event.end_date))
            .map((event) => event.color_code)
            .slice(0, 5);
    }

    async function fetchAcademicEvents(schoolId, year, month) {
        return __fetch(API_PATH, { school: schoolId, year, month });
    }

    useEffect(() => {
        const schoolId = user?.profile?.school || user?.profile?.id;
        const fetchNepaliCalendar = async () => {
            const nepCal = await __fetch(API_PATH, { calendar: true });
            setNepaliCalendar(nepCal);
        }
        const fetchEvents = async () => {
            const year = currentNepaliDate.year,
                month = currentNepaliDate.month;

            const eventsData = await fetchAcademicEvents(schoolId, year, month);
            setEvents(eventsData);
        }

        fetchNepaliCalendar();
        fetchEvents();

    }, [user?.username]);
    // 
    return (
        <div className="flex flex-col min-h-screen w-full bg-blue-gray-50">
            <PreviousButton />
            <header className="my-2 p-4 border-b bg-white sticky top-0 z-10 shadow-sm rounded-md">
                <div className="flex items-center justify-between flex-wrap gap-2 mx-auto">
                    <div className="flex items-center gap-2">
                        <CalendarIcon className="h-6 w-6 text-green-500" />
                        <h1 className="text-xl font-bold text-blue-gray-800">Academic Calendar</h1>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <Button className="px-4 py-1.5 text-sm font-medium border transition-colors"
                            onClick={() => {
                                const current = user?.today;
                                setCurrentNepaliDate(current);
                                setExpandedMonths([current.month]);
                            }} variant="text">
                            Today
                        </Button>

                        <div className="flex items-center">
                            <Button variant="text" className="p-1.5 transition-colors"
                                onClick={prevYear}>
                                <ChevronLeftIcon className="h-4 w-4" />
                            </Button>

                            <span className="mx-2 text-lg font-medium text-blue-gray-800">{currentNepaliDate.year} BS</span>

                            <Button variant="text" className="p-1.5 transition-colors"
                                onClick={nextYear}>
                                <ChevronRightIcon className="h-4 w-4" />
                            </Button>
                        </div>

                        <Button variant="text"
                            className="px-3 py-1.5 text-sm font-medium border transition-colors"
                            onClick={toggleAllMonths}
                        >
                            {showAllMonths ? "Show Current Month" : "Show All Months"}
                        </Button>
                    </div>
                </div>
            </header>

            <div className="flex-1 p-4 mx-auto w-full">
                <div className="h-[calc(100vh-120px)] overflow-auto rounded-md border bg-white shadow-sm">
                    <div className="p-4 space-y-6">
                        {nepaliMonths.map((monthName, index) => {
                            const monthNumber = index + 1;
                            const isExpanded = expandedMonths.includes(monthNumber);
                            const isCurrentMonth = monthNumber === currentNepaliDate.month;
                            const nepaliMonthDays = getNepaliMonthDays(currentNepaliDate.year, monthNumber);

                            return (
                                <div ref={isCurrentMonth ? handleCurrentMonthRef : null} key={monthNumber}
                                    className="overflow-hidden rounded-md">
                                    <div
                                        onClick={() => toggleMonth(monthNumber)}
                                        className={`p-2 flex items-center justify-between cursor-pointer hover:bg-blue-gray-50 transition-colors
                                            ${isCurrentMonth ? "bg-blue-50" : ""}`} >
                                        <h2 className="text-xl font-bold text-blue-gray-800">
                                            {monthName}
                                        </h2>
                                        <div className="flex items-center gap-2">
                                            {isCurrentMonth && (
                                                <span className="text-xs bg-blue-200 text-blue-700 px-2 py-1 rounded-full">Current Month</span>
                                            )}
                                            {isExpanded ? (
                                                <ChevronUpIcon className="h-5 w-5 text-blue-gray-500" />
                                            ) : (
                                                <ChevronDownIcon className="h-5 w-5 text-blue-gray-500" />
                                            )}
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <div className="p-0">
                                            <div className="grid grid-cols-7 gap-px bg-white">
                                                {days.map((day) => (
                                                    <div key={day} className="border-b border-gray-500 p-5 text-center font-semibold text-blue-gray-700">
                                                        <span className="text-base font-medium">{day}</span>
                                                    </div>
                                                ))}

                                                {/* offset */}
                                                {Array(getStartingDay(currentNepaliDate.year, monthNumber, 1))
                                                    .fill(null)
                                                    .map((_, i) => (
                                                        <div key={`empty-${i}`} className="bg-white" />
                                                    ))}

                                                {/* Days of the month */}
                                                {
                                                    nepaliMonthDays.map((day) => {
                                                        const dateStr = `${currentNepaliDate.year}-${monthNumber.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
                                                        const hasEvents = hasEventsForDay(currentNepaliDate.year, monthNumber, day);
                                                        const eventColors = getEventColorsForDay(currentNepaliDate.year, monthNumber, day);
                                                        const isToday = monthNumber === currentNepaliDate.month && day === currentNepaliDate.day;

                                                        return (
                                                            <div
                                                                key={`${monthNumber}-${day}`}
                                                                onClick={() => handleDateClick(currentNepaliDate.year, monthNumber, day)}
                                                                className={`min-h-[80px] bg-white p-2 relative hover:bg-blue-50 cursor-pointer transition-colors rounded-md
                                                            ${isToday ? "!bg-blue-50" : ""}
                                                            ${selectedDate === dateStr ? "ring-2 ring-blue-500 font-bold ring-inset" : ""}`} >
                                                                <div className={`text-xl text-center font-medium ${isToday ? "text-blue-500" : "text-blue-gray-800"}`}>
                                                                    {day}
                                                                </div>

                                                                {/* Event indicators */}
                                                                {hasEvents && (
                                                                    <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
                                                                        {eventColors.map((color, i) => (
                                                                            <div key={i} className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                                                                        ))}
                                                                        {eventColors.length > 3 && <div className="w-2 h-2 rounded-full bg-blue-gray-400" />}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )
                                                    })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>

            {drawerOpen && (
                <EventsView selectedDate={selectedDate} selectedDateEvents={selectedDateEvents} setDrawerOpen={setDrawerOpen}
                    expandedDescriptions={expandedDescriptions} toggleDescriptionExpand={toggleDescriptionExpand} />
            )}
        </div>
    )
}

export default Calendar;