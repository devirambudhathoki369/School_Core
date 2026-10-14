import { createContext, useContext } from "react"
const SearchContext = createContext({});

const useSearch = () => {
    return useContext(SearchContext);
}

// STUDENT-SC
function SearchProvider({ children, value }) {
    return (
        <SearchContext.Provider value={value}>
            {children}
        </SearchContext.Provider>
    )
}

export default SearchProvider
export { useSearch };