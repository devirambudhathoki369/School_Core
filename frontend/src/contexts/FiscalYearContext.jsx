import { createContext, useContext, useEffect, useState } from 'react';
import { useAppContext } from './AppContext';
import { applyEconomicYear } from '@/services/functions/schools';
import useRequestStatus from '@/hooks/requestStatus';

const YearContext = createContext();

function useYear() {
    return useContext(YearContext);
}

function YearProvider({
    children,
    yearSchema,
    validationSchema,
    getYearsFunction,
    saveYearFunction,
    contextType
}) {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    yearSchema['school'] = user?.profile?.school || user?.profile?.id;

    const [year, setYear] = useState({ ...yearSchema });
    const [years, setYears] = useState([]);
    const [errors, setErrors] = useState({});
    const { uploading, fetching, statusHandler } = useRequestStatus();

    async function onSubmit(e) {
        e.preventDefault();
        statusHandler.toggleUploading();
        try {
            await validationSchema.validate(year);
            const [status, message, data] = await saveYearFunction(year);
            if (status === 200) {
                if (data?.year) {
                    setYears(state => [data.year, ...state]);
                }
                reset();
            }
            updateNotification(status, message);
        } catch ({ message }) {
            updateNotification(400, message);
        }
        statusHandler.toggleUploading();
    }
    // 
    async function onChange({ name, value }) {
        setYear(state => ({ ...state, [name]: value }));
    }

    async function onBlur({ name, value }) {
        try {
            await validationSchema.validateAt(name, { [name]: value });
            setErrors(({ [name]: _, ...errors }) => (errors));
        } catch ({ message }) {
            setErrors(errors => ({ ...errors, [name]: message }));
        }
    }

    function reset() {
        setYear({ ...yearSchema });
        setErrors({});
    }
    // 
    async function onSelect(action, id, item) {
        if (action === "apply") {
            const [status, message,] = await applyEconomicYear(id); // id is economic year id;
            updateNotification(status, message);
        } else if (action === "close") {
            updateNotification('', "Not available at the moment!");
        }
    }
    // 
    useEffect(() => {
        (async () => {
            statusHandler.toggleFetching();
            const data = await getYearsFunction(user?.profile?.school || user?.profile?.id);
            setYears(data);
            statusHandler.toggleFetching();
        })();
    }, [user]);
    // 
    return (
        <YearContext.Provider value={{
            data: { year, years, errors },
            methods: { onChange, onBlur, onSubmit, reset, onSelect },
            status: { uploading, fetching, statusHandler }
        }}>
            {children}
        </YearContext.Provider>
    );
}

export default YearProvider;
export { useYear };