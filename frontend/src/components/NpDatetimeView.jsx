import { useAppContext } from "@/contexts/AppContext";
import { useEffect, useState } from "react";
import { months } from "@/components/inputs/options/months";

const notifications = {
    ONLINE: "Internet connection restored!",
    OFFLINE: "Internet connection lost!"
}

function NpDatetimeView() {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    const [time, setTime] = useState('');

    function getCurrentTime() {
        const now = new Date();
        let hours = now.getHours();
        let minutes = now.getMinutes();
        let seconds = now.getSeconds();
        const am_pm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12;
        hours = hours < 10 ? '0' + hours : hours;
        minutes = minutes < 10 ? '0' + minutes : minutes;
        seconds = seconds < 10 ? '0' + seconds : seconds;
        return hours + ':' + minutes + ':' + seconds + ' ' + am_pm;
    }

    useEffect(() => {
        const timerId = setInterval(() => {
            const _time = getCurrentTime();
            setTime(_time);
        }, 1000);

        // check network connection and notify!!!
        const handleConnectionChange = () => {
            if (navigator.onLine) {
                updateNotification(200, notifications.ONLINE);
            } else {
                updateNotification(500, notifications.OFFLINE)
            }
        };
        window.addEventListener('online', handleConnectionChange);
        window.addEventListener('offline', handleConnectionChange);

        return () => {
            clearInterval(timerId);
            window.removeEventListener('online', handleConnectionChange);
            window.removeEventListener('offline', handleConnectionChange);
        }
    }, [user]);

    // The Nepali date arrives as "2083-06-18". It is kept in that form — it is
    // the form every date field in the app is typed in — and said a second time
    // the way a person reads a calendar: the month and the day on a small leaf,
    // the weekday beside it.
    const [, month, day] = `${user?.today || ""}`.split("-");
    const monthName = months[parseInt(month, 10)] || "";
    const weekday = new Date().toLocaleDateString("en-US", { weekday: "long" });

    return (
        // The date and the clock are each atomic — letting them wrap split
        // "2083-04-16" across two lines in the header. They shrink as a unit or
        // not at all.
        <div className="app-clock flex items-center whitespace-nowrap shrink-0">
            {monthName && day &&
                <span className="app-clock-leaf" aria-hidden="true">
                    <span className="app-clock-month">{monthName}</span>
                    <span className="app-clock-day tabular-nums">{parseInt(day, 10)}</span>
                </span>}
            <span className="app-clock-text">
                <span className="app-clock-date tabular-nums">
                    {user?.today ? <><span className="app-clock-weekday">{weekday}</span><span className="app-clock-dot"> · </span>{user.today}</> : weekday}
                </span>
                <span className="app-clock-time tabular-nums" aria-hidden="true">{time}</span>
            </span>
        </div>
    )
}

export default NpDatetimeView;