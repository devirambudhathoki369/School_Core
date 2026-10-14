const InstitutionType = {
    SCHOOL: 1, COLLEGE: 2, CAMPUS: 3,
}

const InstitutionTypeOptions = [
    { value: InstitutionType.SCHOOL, name: 'school' },
    { value: InstitutionType.COLLEGE, name: 'college' },
    { value: InstitutionType.CAMPUS, name: 'campus' },
];
const InstitutionTypeObject = InstitutionTypeOptions.reduce((acc, val) => {
    acc[val.value] = val.name;
    return acc;
}, {});

const notSchool = (type) => [InstitutionType.COLLEGE, InstitutionType.CAMPUS].includes(parseInt(type));

// ---
const SchoolChiefs = {
    Principal: { value: 1, name: "Principal" },
    HeadTeacher: { value: 2, name: "Head Teacher" },
}
const SchoolChiefOptions = [
    { ...SchoolChiefs.Principal },
    { ...SchoolChiefs.HeadTeacher },
]
const SchoolChiefMap = Object.values(SchoolChiefs).reduce((acc, opt) => {
    acc[opt.value] = opt.name;
    return acc;
}, {});

export {
    InstitutionType, InstitutionTypeOptions, InstitutionTypeObject, notSchool,
    SchoolChiefs, SchoolChiefOptions, SchoolChiefMap,
};