import Image from "next/image";
import { EnvelopeIcon, PhoneIcon } from "@heroicons/react/24/outline";

function BillHeader({ user }) {
    const profile = {
        name: user?.profile?.school_name || user?.profile?.name || '',
        logo: user?.profile?.school_logo || user?.profile?.logo || '',
        slogan: user?.profile?.school_slogan || user?.profile?.slogan || '',
        address: user?.profile?.school_address || user?.profile?.address || '',
        contact: user?.profile?.school_contact || user?.profile?.contact || '',
        telephone: user?.profile?.school_telephone || user?.profile?.telephone || '',
        email: user?.profile?.school_email || user?.profile?.email || '',
        pan_no: user?.profile?.school_pan_no || user?.profile?.pan_no || '',
        estd_date: (user?.profile?.school_estd_date || user?.profile?.estd_date)?.split('-')?.[0] || '',
    }
    return (
        <div className={"header"}>
            <>
                <div className="flex justify-between items-center">
                    <span className="text-right">PAN :- {profile.pan_no}</span>
                    <span className="text-right">ESTD :- {profile.estd_date} BS</span>
                </div>
            </>
            <>
                <div className="flex">
                    <div className="overflow-hidden">
                        <Image unoptimized alt={profile.name || ''} width={100} height={100} className="overflow-hidden"
                            src={profile?.logo ? `${process.env.NEXT_PUBLIC_BASE_URL}/media/${profile.logo}` : ''} />
                    </div>
                    <div className="w-full">
                        <div className="flex flex-col">
                            <span className="!font-bold !text-xl w-full text-center">{profile.name}</span>
                            <span className="text-center">{profile.address}</span>
                        </div>
                        <div className="flex flex-col items-end mt-1">
                            <span className="text-center flex items-center">
                                <PhoneIcon className="w-4 h-4 mr-2" />
                                {profile.contact} {profile.telephone ? `, ${profile.telephone}` : ''}
                            </span>
                            <span className="text-center flex items-center">
                                <EnvelopeIcon className="w-4 h-4 mr-2" />
                                {profile.email}
                            </span>
                        </div>
                    </div>
                </div>
            </>
        </div>
    )
}

export default BillHeader;