import { createContext, useContext, useState } from "react";

const TempContext = createContext({});

const useTempState = () => {
    return useContext(TempContext);
}

function TempStateContextProvider({ children }) {
    const [tempState, setTempState] = useState({});

    function saveTempState(key, data) {
        setTempState(state => ({ ...state, [key]: data }));
    }
    function getTempState(key, reset = true) {
        const data = tempState?.[key];
        if (reset && data) {
            setTempState(({ [key]: _, ...state }) => ({ ...state }));
        }
        return data;
    }

    return (
        <TempContext.Provider value={{
            saveTempState, getTempState,
        }}>
            {children}
        </TempContext.Provider>
    )
}

export default TempStateContextProvider;
export { useTempState };