import { createContext, useContext } from "react";

const EnrollmentContext = createContext({});
function useEnrollmentContext() {
    return useContext(EnrollmentContext);
}
function EnrollmentContextProvider({ children, value }) {
    return (
        <EnrollmentContext.Provider value={value}>
            {children}
        </EnrollmentContext.Provider>
    )
}

// sample usage;
// function AdminPage() {
//     const adminSchema = {};//admin form inputs as schema here;
//     return (
//         <EnrollmentContextProvider value={adminSchema}>
//             {/* admin-register-form */}
//         </EnrollmentContextProvider>
//     )
// }
// function ClientPage() {
//     const clientSchema = {};//client form inputs as schema here;
//     return (
//         <EnrollmentContextProvider value={clientSchema}>
//             {/* client-register-form */}
//         </EnrollmentContextProvider>
//     )
// }

export default EnrollmentContextProvider;
export { useEnrollmentContext };