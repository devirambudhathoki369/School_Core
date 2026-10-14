import Image from "next/image";
import { PhoneIcon, EnvelopeIcon } from "@heroicons/react/24/outline";
import numberToWords from "@/methods/numberToWords";
import { months } from "@/components/inputs/options/months";
import showOnlyClass from "@/methods/showOnlyClass";
import { formatInvoiceNo } from "@/methods/formatInvoiceNo";

const baseURL = process.env.NEXT_PUBLIC_BASE_URL;

function ReminderBill({ bill: invoice, schoolProfile, extraInfo }) {
    return (
        <div className="reminder-bill-placeholder">
            <div className={"bill"}>
                <div className={"header"}>
                    <>
                        <div className="flex justify-between items-center">
                            <span className="text-right">PAN :- {schoolProfile?.pan_no}</span>
                            <span className="text-right">ESTD :- {schoolProfile?.estd_date} BS</span>
                        </div>
                    </>
                    <>
                        <div className="flex">
                            <div className="overflow-hidden">
                                <Image unoptimized alt={schoolProfile?.schoolName || ''} width={100} height={100}
                                    src={schoolProfile?.logo ? `${baseURL}/media/${schoolProfile.logo}` : ''} />
                            </div>
                            <div className="w-full">
                                <div className="flex flex-col">
                                    <span className="!font-bold !text-[0.9rem] w-full text-center">{schoolProfile?.schoolName}</span>
                                    <span className="text-center">{schoolProfile?.address}</span>
                                </div>
                                <div className="flex flex-col items-end mt-1">
                                    <span className="text-center flex items-center">
                                        <PhoneIcon className="w-4 h-4 mr-2" />
                                        {schoolProfile?.contact} {schoolProfile?.telephone ? `, ${schoolProfile.telephone}` : ''}
                                    </span>
                                    <span className="text-center flex items-center">
                                        <EnvelopeIcon className="w-4 h-4 mr-2" />
                                        {schoolProfile?.email}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </>
                </div>
                <hr className="my-1 print:my-0 border-black" />
                <div className="w-full flex flex-col gap-y-1 text-lg">
                    <span className="text-center !font-bold underline">
                        REMINDER BILL
                    </span>
                    <div className="grid grid-cols-2 gap-x-6">
                        <span>Invoice No :- {formatInvoiceNo(invoice?.invoiceId)}</span>
                        <span className="text-right">Date :- {invoice?.date}</span>
                        <span className="col-span-2 capitalize">guardian name :- {invoice?.guardianName}</span>
                        <span className="col-span-2 capitalize">student name :- {invoice?.studentName} ({invoice?.studentId})</span>
                        <span className="col-span-2 capitalize">class :- {showOnlyClass(invoice?.class)}</span>
                    </div>
                    <div className="my-0.5 print:my-0">
                        <span className="my-0.5 flex justify-between">
                            <div>
                                For the months :
                                <span className="capitalize ml-1">
                                    {invoice.months.map(m => months[m]).join(', ')}
                                </span>
                            </div>
                        </span>
                        <table className="w-full !rounded-2xl">
                            <thead>
                                <tr>
                                    {
                                        // ['particulars', 'rate', 'previous due', 'due', 'total due']
                                        ['particulars', 'rate', 'amount']
                                            ?.map((parhead, phi) => (
                                                <th className="font-semibold uppercase p-1" key={phi}>{parhead}</th>
                                            ))
                                    }
                                </tr>
                            </thead>
                            <tbody>
                                {invoice?.particulars
                                    ?.map((detail, i) => {
                                        // const [title, rate, previous_due, due, total_due] = detail;
                                        const [title, rate, , due,] = detail;
                                        return (
                                            <tr key={i}>
                                                {
                                                    due ?
                                                        <>
                                                            <td className="uppercase h-5 print:h-4">{title || ''}</td>
                                                            <td>{rate || ''}</td>
                                                            {/* <td>{previous_due || ''}</td> */}
                                                            <td className="text-center">{due || ''}</td>
                                                            {/* <td>{total_due || ''}</td> */}
                                                        </> :
                                                        <>
                                                            <td className="h-5 print:h-4"></td>
                                                            <td></td>
                                                            <td></td>
                                                            {/* <td></td>
                                                            <td></td> */}
                                                        </>
                                                }
                                            </tr>
                                        )
                                    })
                                }
                                <tr>
                                    <td>Total Amount (This Bill Only)</td>
                                    <td colSpan={4} className="text-right">{invoice?.due || 0}</td>
                                </tr>
                                <tr>
                                    <td>Old dues (Before this bill)</td>
                                    <td colSpan={4} className="text-right">{invoice?.previous_due || 0}</td>
                                </tr>
                                <tr>
                                    <td>Payment received after this posting</td>
                                    <td colSpan={4} className="text-right">{invoice?.paid || 0}</td>
                                </tr>
                                <tr>
                                    <td>Other adjustments</td>
                                    <td colSpan={4} className="text-right">{invoice?.adjusted || 0}</td>
                                </tr>
                                <tr>
                                    <td>Total dues</td>
                                    <td colSpan={4} className="text-right">{invoice?.total || 0}</td>
                                </tr>
                            </tbody>
                        </table>
                        <div className="flex flex-col mt-2">
                            <span>In words :- {numberToWords(invoice?.total)} only /-</span>
                            {invoice?.discount &&
                                <span>Discount : Discount of Rs. {invoice.discount} only /-</span>
                            }
                            {invoice?.remarks &&
                                <span>Remarks : {invoice.remarks}</span>
                            }
                        </div>
                    </div>
                </div>
                {extraInfo?.note &&
                    <p className="p-1 border-l border-gray-500 rounded-md">{extraInfo.note}</p>}
                <div className="flex justify-end mt-2">
                    <div className="flex flex-col w-1/4">
                        {
                            schoolProfile?.sign ?
                                <Image unoptimized alt={schoolProfile.schoolName}
                                    src={baseURL + '/media/' + schoolProfile.sign} width={100} height={100} />
                                :
                                <span className="border-b border-black text-right">
                                    {schoolProfile?.cashier}
                                </span>
                        }
                        <span className="text-right">Accountant</span>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default ReminderBill;