import { formatNepaliDate } from "./methods";

function EventsView({ selectedDate, selectedDateEvents = [], setDrawerOpen, expandedDescriptions = {}, toggleDescriptionExpand }) {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-25 z-50 flex justify-end">
            <div className="bg-white w-full max-w-lg h-full overflow-auto animate-in slide-in-from-right">
                <div className="p-4 border-b">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold text-blue-gray-800">{formatNepaliDate(selectedDate)}</h2>
                        <button
                            onClick={() => setDrawerOpen(false)}
                            className="p-1.5 rounded-full hover:bg-blue-gray-100 text-blue-gray-500"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                strokeWidth={1.5}
                                stroke="currentColor"
                                className="w-5 h-5"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div className="p-2">
                    {selectedDateEvents.length === 0 ? (
                        <div className="text-center py-8">
                            <p className="text-blue-gray-600 text-base">No events scheduled for this date</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {selectedDateEvents.map((event) => {
                                const isExpanded = expandedDescriptions.includes(event.id)
                                const isLongDescription = event.description.length > 100;

                                return (
                                    <div
                                        key={event.id}
                                        className="p-3 rounded-lg border hover:shadow-md transition-shadow"
                                        style={{ borderLeftColor: event.color_code, borderLeftWidth: "6px" }}
                                    >
                                        <div className="flex items-center justify-between gap-x-2 mb-1">
                                            <div className="text-sm ">
                                                {event.start_date === event.end_date ? (
                                                    <span>{formatNepaliDate(event.start_date)}</span>
                                                ) : (
                                                    <span>
                                                        {formatNepaliDate(event.start_date)} - {formatNepaliDate(event.end_date)}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-x-2">
                                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: event.color_code }} />
                                                <h3 className="font-medium text-blue-gray-800 text-sm">{event.type_str}</h3>
                                            </div>
                                        </div>

                                        <p className="text-base text-blue-gray-700">
                                            {isExpanded || !isLongDescription
                                                ? event.description
                                                : `${event.description.substring(0, 100)}...`}
                                        </p>

                                        {isLongDescription && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    toggleDescriptionExpand(event.id)
                                                }}
                                                className="mt-2 px-3 py-1 text-sm font-medium text-blue-600 hover:text-blue-800 border border-blue-200 rounded-md hover:bg-blue-50 transition-colors"
                                            >
                                                {isExpanded ? "Read Less" : "Read More"}
                                            </button>
                                        )}
                                    </div>)
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default EventsView;