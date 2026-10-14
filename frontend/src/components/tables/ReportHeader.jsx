import { useAppContext } from "@/contexts/AppContext";
import { Typography, Card } from "@material-tailwind/react";
import Image from "next/image";
import { PhoneIcon, EnvelopeIcon } from "@heroicons/react/24/outline";
import { formatImagePath } from "@/methods/formatMediaPath";
import AutoFitText from "../AutoFitText";
import useDocumentStyle from "@/hooks/documentStyle";
import DocumentMasthead from "../documents/DocumentMasthead";

const optionsSchema = { hideContacts: false, hideSlogan: false };
// general parent-width and maxFontSize! [CALCULATED!]
function ReportHeader({ hidden = true, parentWidth = 600, maxFontSize = 27.32, affiliate = null, options = { ...optionsSchema }, documentKey = null, title = null }) {
    const { user: { user } } = useAppContext();
    // A document that names itself can be laid out by the superadmin. One that
    // does not (or whose school has no styling switched on) keeps the header
    // below exactly as it is — this must never change a sheet by accident.
    const docStyle = useDocumentStyle(documentKey || "__none__");
    const profile = {
        name: user?.profile?.school_name || user?.profile?.name || '',
        logo: user?.profile?.school_logo || user?.profile?.logo || '',
        award_logo: user?.profile?.school_award_logo || user?.profile?.award_logo || '',
        slogan: user?.profile?.school_slogan || user?.profile?.slogan || '',
        address: user?.profile?.school_address || user?.profile?.address || '',
        contact: user?.profile?.school_contact || user?.profile?.contact || '',
        telephone: user?.profile?.school_telephone || user?.profile?.telephone || '',
        email: user?.profile?.school_email || user?.profile?.email || '',
        estd_date: (user?.profile?.school_estd_date || user?.profile?.estd_date)?.split('-')?.[0] || '',
    }
    const styledLayout = documentKey && docStyle.className ? docStyle.style?.layout : null;
    if (styledLayout) {
        return (
            <div className={`report-header mb-2 ${hidden ? 'hidden' : ''}`}>
                {user?.profile &&
                    <div className="profile flex flex-col items-center py-1 relative">
                        <DocumentMasthead layout={styledLayout} title={title || ''}
                            school={{
                                school_name: profile.name, image: profile.logo,
                                address: profile.address, estd: profile.estd_date,
                                contact: [profile.contact, profile.telephone].filter(Boolean).join(', '),
                                email: profile.email, motto: profile.slogan,
                            }} />
                    </div>
                }
            </div>
        );
    }
    return (
        <div className={`report-header mb-2 ${hidden ? 'hidden' : ''}`}>
            {user?.profile &&
                <Card className="profile flex flex-col items-center py-1 !m-0 shadow-none relative">
                    {!options?.hideSlogan ?
                        <span className="mb-4 font-semibold text-black">"{profile?.slogan || ""}"</span> :
                        <span className="h-2">
                            {/* just to format properly! */}
                        </span>
                    }
                    {affiliate &&
                        <Typography variant="h5" color="red">
                            Affiliated To {affiliate}
                        </Typography>
                    }
                    <div className="w-full flex justify-center items-center">
                        <div className="bg-transparent absolute top-6 left-[6%] overflow-hidden border border-gray-200">
                            <Image unoptimized alt={profile?.name || ''} width={90} height={90} quality={85}
                                src={profile?.logo ? formatImagePath(profile.logo) : ''} priority />
                        </div>
                        <div className="flex text-center flex-col z-20 w-[63%] min-w-[63%] max-w-[63%] items-center">
                            <AutoFitText className="font-semibold text-black" variant="h2"
                                parentWidth={parentWidth} MaxFontSize={maxFontSize}>
                                {profile.name}
                            </AutoFitText>
                            <span className="flex items-center">
                                <Typography color="black" variant="h6">{profile?.address || ''}</Typography>
                            </span>
                            <Typography color="black" variant="h6">ESTD. : {profile?.estd_date || ''} B.S</Typography>
                            {!options?.hideContacts &&
                                <div className="w1/2 flex gap-x-4 items-center mx-auto">
                                    <span className="flex items-center gap-x-1">
                                        <PhoneIcon className="w-[1rem] h-[1rem] text-black stroke-[1.4]" />
                                        <Typography color="black" variant="h6">
                                            {profile?.contact || ''}
                                            {(profile?.contact && profile?.telephone) && ", "}
                                            {profile?.telephone || ''}
                                        </Typography>
                                    </span>
                                    <span className="flex items-center gap-x-1">
                                        <EnvelopeIcon className="w-[1rem] h-[1rem] text-black stroke-[1.4]" />
                                        <Typography color="black" variant="h6">{profile?.email || ''}</Typography>
                                    </span>
                                </div>
                            }
                        </div>
                        {profile?.award_logo &&
                            <div className="bg-transparent absolute top-6 right-[5%] overflow-hidden">
                                <Image unoptimized alt={profile?.name || ''} width={60} height={60}
                                    src={formatImagePath(profile.award_logo)} quality={85} />
                            </div>
                        }
                    </div>
                </Card>
            }
        </div>
    )
}

export default ReportHeader;