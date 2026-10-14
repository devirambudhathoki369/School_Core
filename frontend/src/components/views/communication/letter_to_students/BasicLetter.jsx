import BillHeader from "../../payments/BillHeader";
import Image from "next/image";

const baseURL = process.env.NEXT_PUBLIC_BASE_URL;

function BasicLetter({ user, cashier, message }) {
    return (
        <>
            <div className={"bill"}>
                <BillHeader user={user} /> 
                <hr className="my-2 border-black" />
                <div className="w-full flex flex-col gap-y-1">
                    <span className="text-center !font-bold underline">
                        LETTER
                    </span>
                </div>
                <div className="grid grid-cols-2 gap-x-6">
                    <span>Date :- {user?.today}</span>
                </div>
                <p className="p-2 whitespace-pre-line">
                    &nbsp; {message}
                </p>
                <div className="flex justify-end mt-2">
                    <div className="flex flex-col w-1/4">
                        {
                            user?.sign ?
                                <Image unoptimized alt={user.schoolName}
                                    src={baseURL + '/media/' + user.sign} width={100} height={100} />
                                :
                                <span className="border-b border-black text-right">
                                    {cashier}
                                </span>
                        }
                        <span className="text-right">Accountant</span>
                    </div>
                </div>
            </div>
        </>
    )
}

export default BasicLetter;