import { formatImagePath } from "@/methods/formatMediaPath";
import { UserIcon, BookmarkIcon, MapPinIcon, PhoneIcon, EnvelopeIcon, EyeIcon, BuildingLibraryIcon, InformationCircleIcon, CalendarIcon } from "@heroicons/react/24/outline";

const Role_Student = 1, Role_Staff = 2;

function PublicProfile({ role = Role_Student, details }) {
    try {
        role = parseInt(role);
    } catch (e) { }

    return (
        <div className="min-h-screen w-[85%] mx-auto bg-sky-50 p-6 text-gray-800 font-sans">
            {/* Student Info */}
            <section className="bg-white rounded-xl shadow-md p-6 md:p-8 border border-orange-100 mb-10">
                <div className="flex flex-col sm:flex-row items-center gap-y-6 gap-x-12">
                    <img
                        src={formatImagePath(details?.user?.image)}
                        alt={details?.user?.name || "profile avatar"}
                        className="w-24 h-24 rounded-full object-cover border-4 border-orange-400 shadow"
                    />
                    <div className="text-center sm:text-left">
                        <h2 className="text-xl font-semibold text-blue-800 uppercase">{details?.user?.name}</h2>
                        {details?.user?.birth_date &&
                            <p className="text-gray-600 flex items-center gap-2 capitalize">
                                <CalendarIcon className="icon text-green-600" />Birth Date : {details?.user?.birth_date}
                            </p>}
                        {details?.user?.blood_group &&
                            <p className="text-gray-600 flex items-center gap-2 capitalize">
                                <BloodIcon className="icon text-red-600" />Blood Group : {details?.user?.blood_group}
                            </p>}
                        <>
                            {role === Role_Student &&
                                <>
                                    <p className="text-gray-600 flex items-center gap-2 capitalize">
                                        <BookmarkIcon className="icon text-teal-600" />Class : {details?.user?.classname}
                                    </p>
                                    {details?.user?.guardian_name &&
                                        <p className="text-gray-600 flex items-center gap-2 capitalize">
                                            <UserIcon className="icon text-cyan-600" />Guardian : {details?.user?.guardian_name}
                                        </p>}
                                    {details?.user?.guardian_contact &&
                                        <p className="text-gray-600 flex items-center gap-2">
                                            <PhoneIcon className="icon text-green-600" />Contact : {details?.user?.guardian_contact}
                                        </p>}
                                    {details?.user?.guardian_address &&
                                        <p className="text-gray-600 flex items-center gap-2 capitalize">
                                            <MapPinIcon className="icon text-blue-600" />Address : {details?.user?.guardian_address}
                                        </p>}
                                </>
                            }
                        </>
                        <>
                            {role === Role_Staff &&
                                <>
                                    <p className="text-gray-600 flex items-center gap-2 capitalize">
                                        <DesignationIcon className="icon text-green-600" />Designation : {details?.user?.designation}
                                    </p>
                                    {details?.user?.primary_contact &&
                                        <p className="text-gray-600 flex items-center gap-2">
                                            <PhoneIcon className="icon text-orange-600" />
                                            Contact : {details?.user?.primary_contact} {details?.user?.secondary_contact}
                                        </p>}
                                    {details?.user?.location &&
                                        <p className="text-gray-600 flex items-center gap-2 capitalize">
                                            <MapPinIcon className="icon text-blue-600" />Address : {details?.user?.location}
                                        </p>}
                                </>
                            }
                        </>
                    </div>
                </div>
            </section>

            {/* Organization Info */}
            <section className="bg-white rounded-xl shadow-md p-6 md:p-8 border border-sky-100">
                <p className="text-sm text-center text-teal-700 font-medium">"{details?.org?.slogan}"</p>
                <div className="flex flex-col-reverse md:flex-row justify-between items-start gap-6">
                    <div className="flex-1 space-y-2">
                        <h1 className="text-2xl font-bold text-blue-800">{details?.org?.name}</h1>
                        <p className="flex items-center gap-2 text-sm text-gray-700 capitalize">
                            <MapPinIcon className="icon" />Address : {details?.org?.address}
                        </p>
                        <p className="flex items-center gap-2 text-sm text-gray-700">
                            <PhoneIcon className="icon" />Contact : {details?.org?.contact}
                        </p>
                        <p className="flex items-center gap-2 text-sm text-gray-700">
                            <TelephoneIcon className="icon" />Telephone : {details?.org?.telephone}
                        </p>
                        <p className="flex items-center gap-2 text-sm text-gray-700">
                            <EnvelopeIcon className="icon" />Email : {details?.org?.email}
                        </p>
                        <p className="flex items-center gap-2 text-sm text-gray-700">
                            <BuildingLibraryIcon className="icon" />Estd: {details?.org?.estd_date}
                        </p>

                        {/* Calendar Button */}
                        <div className="pt-4">
                            <button className="bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-md text-sm flex items-center gap-2">
                                <EyeIcon className="icon" /> View Calendar
                            </button>
                        </div>
                    </div>

                    <div className="flex gap-4 mb-2 md:mb-0 justify-center md:justify-end">
                        <img
                            src={formatImagePath(details?.org?.logo)}
                            alt="School Logo"
                            className="w-20 h-20 rounded-lg object-cover border border-blue-200"
                        />
                        {details?.org?.award_logo &&
                            <img
                                src={formatImagePath(details.org.award_logo)}
                                alt="Award Logo"
                                className="w-20 h-20 rounded-lg object-cover border border-blue-200"
                            />
                        }
                    </div>
                </div>

                <div className="mt-6 border-t pt-4">
                    <h2 className="text-lg font-semibold text-blue-700 flex items-center gap-2">
                        <InformationCircleIcon className="text-teal-600 icon" /> About Us
                    </h2>
                    <p className="text-sm text-gray-700 leading-relaxed mt-2">{details?.org?.about_us}</p>
                </div>
            </section>
        </div>
    );
}

function TelephoneIcon({ className }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" className={`w-6 h-6 ${className}`}>
            <path
                fill="#1a171b"
                d="M39.534 0H12.8a7.3 7.3 0 0 0-7.293 7.3v20.33A6.241 6.241 0 0 0 0 33.814v7.951A6.24 6.24 0 0 0 6.234 48h4.7a6.241 6.241 0 0 0 6.234-6.234v-3.99a5.3 5.3 0 0 0 4.568-5.238V10.263a5.295 5.295 0 0 0-10.59 0v22.273a5.3 5.3 0 0 0 4.568 5.238v3.99a4.785 4.785 0 0 1-4.779 4.779h-4.7a4.785 4.785 0 0 1-4.78-4.779v-7.951a4.774 4.774 0 0 1 4.052-4.707v6.4a7.3 7.3 0 0 0 7.3 7.3.728.728 0 1 0 0-1.456 5.847 5.847 0 0 1-5.846-5.85V7.3A5.847 5.847 0 0 1 12.8 1.454h26.734A5.849 5.849 0 0 1 45.377 7.3v28.2a5.848 5.848 0 0 1-5.843 5.842H20.076a.727.727 0 1 0 0 1.454h19.458a7.3 7.3 0 0 0 7.3-7.3V7.3a7.3 7.3 0 0 0-7.3-7.3zM12.6 32.537V10.263a3.841 3.841 0 1 1 7.681 0v22.273a3.845 3.845 0 0 1-3.84 3.84 3.843 3.843 0 0 1-3.841-3.839z"
            />
            <path
                fill="#1a171b"
                d="M41.4 6.666a1.7 1.7 0 0 0-1.7-1.7H27.2a1.7 1.7 0 0 0-1.7 1.7v4.341a1.7 1.7 0 0 0 1.7 1.7h12.5a1.7 1.7 0 0 0 1.7-1.7zm-1.455 4.341a.242.242 0 0 1-.242.243H27.2a.242.242 0 0 1-.242-.243V6.666a.242.242 0 0 1 .242-.243h12.5a.242.242 0 0 1 .242.243zM34.664 17.531H32.24a.728.728 0 1 0 0 1.456h2.424a.728.728 0 0 0 0-1.456zM34.664 23.814H32.24a.728.728 0 1 0 0 1.455h2.424a.728.728 0 1 0 0-1.455zM34.664 30.1H32.24a.728.728 0 1 0 0 1.455h2.424a.728.728 0 1 0 0-1.455zM34.664 36.377H32.24a.728.728 0 0 0 0 1.456h2.424a.728.728 0 0 0 0-1.456zM26.169 18.986h2.424a.728.728 0 0 0 0-1.456h-2.424a.728.728 0 0 0 0 1.456zM26.169 25.268h2.424a.728.728 0 1 0 0-1.455h-2.424a.728.728 0 0 0 0 1.455zM26.169 31.55h2.424a.728.728 0 1 0 0-1.455h-2.424a.728.728 0 0 0 0 1.455zM26.169 37.832h2.424a.728.728 0 0 0 0-1.456h-2.424a.728.728 0 0 0 0 1.456zM40.673 17.531h-2.424a.728.728 0 1 0 0 1.456h2.424a.728.728 0 1 0 0-1.456zM40.673 23.814h-2.424a.728.728 0 1 0 0 1.455h2.424a.728.728 0 1 0 0-1.455zM40.673 30.1h-2.424a.728.728 0 1 0 0 1.455h2.424a.728.728 0 1 0 0-1.455zM40.673 36.377h-2.424a.728.728 0 0 0 0 1.456h2.424a.728.728 0 0 0 0-1.456z"
            />
        </svg>
    )
}

function BloodIcon({ className }) {
    return (
        <svg
            className={className}
            viewBox="0 0 24 24"
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
        >
            <path d="M12 2C12 2 5 10.5 5 15.5C5 19.09 8.14 22 12 22C15.86 22 19 19.09 19 15.5C19 10.5 12 2 12 2ZM12 20C9.24 20 7 17.76 7 15C7 13.06 8.92 10.12 12 6.53C15.08 10.12 17 13.06 17 15C17 17.76 14.76 20 12 20Z" />
        </svg>
    );
}

function DesignationIcon({ className }) {
    return (
        <svg
            className={className}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
        >
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 3.75H8.25a.75.75 0 00-.75.75v1.5h9V4.5a.75.75 0 00-.75-.75zM5.25 6.75h13.5a.75.75 0 01.75.75v12a.75.75 0 01-.75.75H5.25a.75.75 0 01-.75-.75v-12a.75.75 0 01.75-.75zM9 12.75h6m-6 3h6m-6-6h.008v.008H9v-.008z"
            />
        </svg>
    );
}

export default PublicProfile;