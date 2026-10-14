import Image from "next/image";
import { EnvelopeIcon, PhoneIcon } from "@heroicons/react/24/outline";

const baseURL = process.env.NEXT_PUBLIC_BASE_URL || '';

function EntryCard({ card, profileImage, examName, schoolProfile, classname, note }) {
    return (
        <div className="bill !max-w-full !w-full">
            <div className={"header"}>
                <>
                    <div className="flex justify-between items-center">
                        <span className="text-right">PAN :- {schoolProfile?.pan_no || ''}</span>
                        <span className="text-right">ESTD :- {schoolProfile?.estd_date || ''} BS</span>
                    </div>
                </>
                <>
                    <div className="flex">
                        <div className="overflow-hidden">
                            <Image unoptimized alt={schoolProfile?.name || ''} width={100} height={100}
                                src={schoolProfile?.logo ? `${baseURL}/media/${schoolProfile.logo}` : ''} />
                        </div>
                        <div className="w-full">
                            <div className="flex flex-col">
                                <span className="!font-bold !text-xl w-full text-center">{schoolProfile?.schoolName || ''}</span>
                                <span className="text-center">{schoolProfile?.address || ''}</span>
                            </div>
                            <div className="flex flex-col items-end mt-1">
                                <span className="text-center flex items-center">
                                    <PhoneIcon className="w-4 h-4 mr-2" />
                                    {schoolProfile?.contact || ''} {schoolProfile?.telephone ? `, ${schoolProfile.telephone}` : ''}
                                </span>
                                <span className="text-center flex items-center">
                                    <EnvelopeIcon className="w-4 h-4 mr-2" />
                                    {schoolProfile?.email || ''}
                                </span>
                            </div>
                        </div>
                    </div>
                </>
            </div>
            <hr className="my-2 border-black" />
            <div className="w-full flex flex-col gap-y-1">
                <span className="text-center !font-bold underline uppercase">
                    ENTRY CARD <br /> {examName || ''} - {schoolProfile?.year}
                </span>
                <div className="flex justify-between items-start">
                    <div className="grid grid-cols-2 gap-x-6">
                        <span className="col-span-2 capitalize">student name :- {card?.studentName || ''}</span>
                        <span className="col-span-2 capitalize">class :- {classname || ''}</span>
                        {card?.rollNo && <span className="col-span-2 capitalize">Roll No. :- {card.rollNo}</span>}
                        {card?.symbolNo && <span className="col-span-2 capitalize">Symbol No. :- {card.symbolNo}</span>}
                        {card?.regdNo && <span className="col-span-2 capitalize">Registration No. :- {card.regdNo}</span>}
                        <span className="col-span-2 capitalize">Exam time :- {card?.time || ''}</span>
                    </div>
                    <div className="w-[80px]">
                        {(profileImage || card?.studentImage) ?
                            <Image unoptimized src={profileImage?.src || (baseURL + '/media/' + card.studentImage) || ''}
                                alt={card.studentName} width={100} height={100} quality={80} />
                            : <div className="min-h-[128px] h-[128px]"></div>
                        }
                    </div>
                </div>
                <div className="my-1">
                    <table className="w-full !rounded-2xl">
                        <thead>
                            <tr className="grid grid-cols-7">
                                <th className="sm:col-span-2 font-semibold p-1">CODE</th>
                                <th className="sm:col-span-3 font-semibold p-1">SUBJECT</th>
                                <th className="sm:col-span-2 font-semibold p-1">DATE</th>
                            </tr>
                        </thead>
                        <tbody>
                            {card?.schedule
                                ?.map((_subject, si) => {
                                    const { id, code, subject, date } = _subject;
                                    return (
                                        <tr key={si} className="grid grid-cols-7">
                                            <td className="sm:col-span-2 capitalize">{code || ''}</td>
                                            <td className="sm:col-span-3 capitalize">{subject || ''}</td>
                                            <td className="sm:col-span-2">{date || ''}</td>
                                        </tr>
                                    )
                                })}
                        </tbody>
                    </table>
                </div>
            </div>
            {note && <p>{note}</p>}
            <div className="flex justify-between items-end w-full mt-2">
                <div className="flex flex-col w-1/4">
                    <div className="w-[50px]">
                        {schoolProfile?.accountantSign ?
                            <Image unoptimized src={baseURL + '/media/' + schoolProfile.accountantSign} alt={'accountant'}
                                width={3840} height={3840} quality={70} className={'min-h-[50px]'} />
                            : <div className="min-h-[50px]"></div>
                        }
                    </div>
                    <span className="text-center w-max">Accountant</span>
                </div>
                <div className="flex flex-col w-1/4">
                    <div className="w-[50px]">
                        {schoolProfile?.examCoordinatorSign ?
                            <Image unoptimized src={baseURL + '/media/' + schoolProfile.examCoordinatorSign} alt={'exam coordinator'}
                                width={3840} height={3840} quality={70} className={'min-h-[50px]'} />
                            : <div className="min-h-[50px]"></div>
                        }
                    </div>
                    <span className="text-center w-max">Exam Coordinator</span>
                </div>
                <div className="flex flex-col w-1/4">
                    <div className="w-[50px]">
                        {schoolProfile?.sign ?
                            <Image unoptimized src={baseURL + '/media/' + schoolProfile.sign} alt={'principal'}
                                width={3840} height={3840} quality={70} className={'min-h-[50px]'} />
                            : <div className="min-h-[50px]"></div>
                        }
                    </div>
                    <span className="text-center w-max">Principal</span>
                </div>
            </div>
        </div>
    )
}

export default EntryCard;