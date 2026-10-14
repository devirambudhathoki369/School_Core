// later, move it to backend!

import cleanClassInfo from "./cleanClassInfo";

function genAcademicYearMappingKey(name, value, class_info) {
    let key;
    const EL = parseInt(class_info?.education_level) || 0;
    if (name === "grade" && EL === 3) {
        // 3
        key = `g${value}`; // no need of education-level in key!
    } else if (name === "year" || name === "semester") {
        // 4,5,8,9
        const nameo = name[0];
        key = `el${class_info.education_level}c${class_info.course}${nameo}${value}`;
    } else if (name === "education_level" && [1, 2, 10].includes(value)) {
        // 1,2,10
        key = `el${value}`;
    }
    // console.log(name, value, key);
    return key;
}

export function prepareNameValue(class_info) {
    class_info = cleanClassInfo(class_info);
    if (class_info?.grade && class_info?.education_level === 3) return { name: "grade", value: class_info.grade };
    else if (class_info?.year) return { name: "year", value: class_info.year };
    else if (class_info?.semester) return { name: "semester", value: class_info.semester };
    else return { name: "education_level", value: class_info?.education_level };
}

export default genAcademicYearMappingKey;