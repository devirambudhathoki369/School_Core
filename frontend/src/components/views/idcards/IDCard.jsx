import { forwardRef, useEffect, useMemo, useState } from "react";
import { Typography } from "@material-tailwind/react";
import JsBarcode from 'jsbarcode';
import QRCode from 'react-qr-code';
import { useRef } from "react";
import Image from "next/image";
import showOnlyClass from "@/methods/showOnlyClass";
import AutoFitText from "@/components/AutoFitText";
import { CardOptions } from "./configs";
import CardCanvas from "@/components/designer/CardCanvas";
import { getIDCardTemplate } from "@/services/functions/idcardTemplates";
import useDigitalIdCode from "@/hooks/digitalIdCode";
/**
 * Displayed/View : 150PPI = 300 x 450 px
 * Required/Export : 300PPI = 600 x 900 px
 */

const baseURL = process.env.NEXT_PUBLIC_BASE_URL;
const domain = typeof window !== "undefined" ? window.location.origin : "";
const IDCardParentWidth = 210,
    IDCardMaxFontSize = 14;

/**
 * The holder's details, in the shape the designer's field catalogue names.
 *
 * This is the ONE place a data field is bound to a card element. The designed
 * card and the built-in one below read the same student object, so anything
 * added here becomes placeable in the designer without touching the renderer.
 */
function cardData({ type, student, validity, profileImage, sign, school, qrUrl }) {
    const isStudent = type === CardOptions.student;
    return {
        name: student?.name || "",
        classname: showOnlyClass(student?.classname) || "",
        section: student?.section || "",
        roll_no: student?.roll_no ?? "",
        symbol_no: student?.symbol_no ?? "",
        guardian_name: student?.guardian_name || "",
        birth_date: student?.birth_date || "",
        blood_group: student?.blood_group || "",
        address: student?.address || "",
        contact: student?.contact || "",
        emis: student?.emis || "",
        bus_station: student?.bus_station || "",
        admission_no: student?.admission_no || "",
        designation: student?.designation || "",
        staff_role: student?.staff_role || student?.role || "",
        citizenship_no: student?.citizenship_no || "",
        email: student?.email || "",
        joined_date: student?.joined_date || "",
        validity: validity || "",
        school_name: school?.name || "",
        school_address: school?.address || "",
        school_contact: school?.contact || "",
        // Images. `profileImage` is the freshly-picked file (a blob URL) when
        // one has been chosen in the picker, otherwise the stored photo.
        photo: profileImage?.src || (student?.image ? `/media/${student.image}` : ""),
        logo: school?.logo || "",
        sign: sign || "",
        award_logo: school?.award_logo || "",
        // The two generated marks. A staff card carries no barcode, which is
        // why this is empty rather than the id — an element bound to it then
        // simply draws nothing.
        qr_value: qrUrl,
        barcode_value: isStudent ? (student?.id ?? "") : "",
    };
}

function IDCard({ type, schoolId, student, validity, profileImage = null, sign = null, filters = {}, school = null }, ref) {
    const barcodeRef = useRef(null);
    //
    const qrCode = useDigitalIdCode(schoolId, student.id, type === CardOptions.staff ? 2 : 1);
    const qrUrl = useMemo(() => {
        const roleParam = type === CardOptions.staff ? `&role=${encodeURIComponent(type)}` : '';
        return `${domain}/profiles?org=${encodeURIComponent(schoolId)}&user=${encodeURIComponent(student.id)}${roleParam}${qrCode}`;
    }, [student.id, qrCode]);

    /**
     * The school's own design, if it has one.
     *
     * `null` is the meaningful default and the reason this is safe to ship to
     * every school at once: a school that has never been opened in the
     * superadmin's designer has no ACTIVE template, so this stays null and the
     * built-in card below is drawn exactly as it always has been. The service
     * memoises per school and card type, so rendering three hundred cards is
     * still one request.
     */
    const [template, setTemplate] = useState(null);
    const cardType = type === CardOptions.staff ? "staff" : "student";
    useEffect(() => {
        let live = true;
        (async () => {
            try {
                const found = await getIDCardTemplate(schoolId, cardType);
                if (live) setTemplate(found || null);
            } catch (_) {
                // A design that cannot be fetched must never stop a school
                // printing cards — it falls back to the built-in one.
                if (live) setTemplate(null);
            }
        })();
        return () => { live = false; };
    }, [schoolId, cardType]);

    useEffect(() => {
        if (barcodeRef.current && type === CardOptions.student && !template) {
            JsBarcode(barcodeRef.current,
                student.id,
                { format: "CODE128", width: 1.5, height: 20, displayValue: false, margin: 0 }
            );
        }
    }, [student?.id, template]);

    // ---- the designed card ---------------------------------------------------
    // Same outer wrapper, same ref target and the same `data-filename` the
    // exporter reads, so every download / zip / print path works unchanged.
    if (template) {
        const { width = 300, height = 450 } = template.size || {};
        return (
            <div className="w-max border border-gray-400 rounded-sm">
                <div ref={ref}
                    data-filename={`${student.name.replace(/\s+/g, '_')}__${Date.now()}.jpeg`}
                    className="id_card overflow-hidden"
                    style={{ width, height }}>
                    <CardCanvas
                        layout={template.layout || []}
                        data={cardData({ type, student, validity, profileImage, sign, school, qrUrl })}
                        width={width}
                        height={height}
                        scale={1}
                        background={template.background}
                        backgroundColor={template.background_color}
                    />
                </div>
            </div>
        );
    }

    // ---- the built-in card, unchanged ---------------------------------------
    return (
        <div className="w-max border border-gray-400 rounded-sm">
            <div ref={ref} data-filename={`${student.name.replace(/\s+/g, '_')}__${Date.now()}.jpeg`}
                className={`!w-[300px] !min-w-[300px] !h-[450px] !min-h-[450px] overflow-hidden flex flex-col items-center justify-center id_card`}>
                <div className="w-[100px] h-[120px] mx-auto overflow-hidden">
                    {(profileImage || student?.image) ?
                        <Image unoptimized src={profileImage?.src || (baseURL + '/media/' + student.image) || ''}
                            alt={student.name} width={3840} height={3840} quality={70} className="object-cover object-top" />
                        : <div className="min-h-[128px]"></div>
                    }
                </div>
                <div className="w-[90%] max-w-[90%] max-auto">
                    <div className="flex flex-col justify-start">
                        <Typography variant="lead" className="mx-auto uppercase">
                            <AutoFitText className="font-semibold" parentWidth={IDCardParentWidth} MaxFontSize={20}>{student.name}</AutoFitText>
                        </Typography>
                        {type === CardOptions.staff &&
                            <>
                                <Typography variant="paragraph" className="capitalize font-semibold">Designation : {student.designation}</Typography>
                                {/* superadmin's choice, per batch — and only when the staff
                                    actually has a number on file. */}
                                {(filters?.showCitizenshipNo && student.citizenship_no) &&
                                    <div className="w-full flex items-end">
                                        <Typography variant="paragraph" className="font-semibold">Citizenship&nbsp;No.&nbsp;:&nbsp;</Typography>
                                        <AutoFitText className="font-semibold" parentWidth={IDCardParentWidth} MaxFontSize={IDCardMaxFontSize}>{student.citizenship_no}</AutoFitText>
                                    </div>
                                }
                            </>
                        }
                        {
                            filters?.showBirthDate &&
                            <Typography variant="paragraph" className="capitalize font-semibold">Date of Birth : {student.birth_date}</Typography>
                        }
                        {type === CardOptions.student &&
                            <>
                                {filters?.showEMIS &&
                                    <Typography variant="paragraph" className="capitalize font-semibold">EMIS : {student.emis}</Typography>
                                }
                                {/*  */}
                                <Typography variant="paragraph" className="capitalize font-semibold">Class : {showOnlyClass(student.classname)}</Typography>
                                <div className="w-full capitalize flex items-end">
                                    <Typography variant="paragraph" className="font-semibold">Guardian&nbsp;:&nbsp;</Typography>
                                    <AutoFitText className="font-semibold" parentWidth={IDCardParentWidth} MaxFontSize={IDCardMaxFontSize}>{student.guardian_name}</AutoFitText>
                                </div>
                            </>
                        }
                        <Typography variant="paragraph" className="font-semibold">Phone : {student.contact}</Typography>
                        <div className="w-full capitalize flex items-end">
                            <Typography variant="paragraph" className="font-semibold">Address&nbsp;:&nbsp;</Typography>
                            <AutoFitText className="font-semibold" parentWidth={IDCardParentWidth} MaxFontSize={IDCardMaxFontSize}>{student.address}</AutoFitText>
                        </div>
                        <>
                            {filters?.showBusStation &&
                                <Typography variant="paragraph" className="capitalize font-semibold">Bus Station : {student.bus_station}</Typography>}
                            {filters?.showBloodGroup &&
                                <Typography variant="paragraph" className="capitalize font-semibold">Blood Group : {student.blood_group}</Typography>}
                        </>
                    </div>
                    <div className="flex gap-x-2 my-2">
                        <div className="w-full flex justify-between items-center">
                            <>
                                {
                                    type === CardOptions.student &&
                                    <svg ref={barcodeRef} style={{ width: '100%', height: 'auto' }}></svg>
                                }
                            </>
                            <Typography variant="paragraph" className="capitalize font-semibold">Validity :  {validity}</Typography>
                        </div>
                    </div>
                    <div className="w-full px-8 flex justify-between items-end my-2">
                        <>
                            <QRCode value={qrUrl} size={70} />
                        </>
                        <div className="w-[70px] bg-gray-50 p-2">
                            {sign ?
                                <Image unoptimized src={baseURL + sign} alt={'school sign'}
                                    width={3840} height={3840} quality={70} className={sign ? '' : 'min-h-[50px]'} />
                                : <div className="min-h-[50px]"></div>
                            }
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default forwardRef(IDCard);
