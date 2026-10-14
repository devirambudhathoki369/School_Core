const GP_LETTER_GRADING = [
    { max: "4.0", min: "3.6", grading: "A+" },
    { max: "3.6", min: "3.2", grading: "A" },
    { max: "3.2", min: "2.8", grading: "B+" },
    { max: "2.8", min: "2.4", grading: "B" },
    { max: "2.4", min: "2.0", grading: "C+" },
    { max: "2.0", min: "1.6", grading: "C" },
    { max: "1.6", min: "1.2", grading: "D" },
    { max: "1.2", min: "0.0", grading: "NG" },
];

const GRADE_POINTS = [
    { min: '90', max: '100', point: 4.0 },
    { min: '80', max: '89.99', point: 3.6 },
    { min: '70', max: '79.99', point: 3.2 },
    { min: '60', max: '69.99', point: 2.8 },
    { min: '50', max: '59.99', point: 2.4 },
    { min: '40', max: '49.99', point: 2.0 },
    { min: '35', max: '39.99', point: 1.6 },
    { min: '0', max: '34.99', point: 0.0 },
]

const PERCENTAGE_LETTER_GRADING = [
    { min: "90", max: "100", grading: "A+" },
    { min: "80", max: "89.99", grading: "A" },
    { min: "70", max: "79.99", grading: "B+" },
    { min: "60", max: "69.99", grading: "B" },
    { min: "50", max: "59.99", grading: "C+" },
    { min: "40", max: "49.99", grading: "C" },
    { min: "35", max: "39.99", grading: "D" },
    { min: "0", max: "34.99", grading: "NG" },
];

// GRADE_POINTS and PERCENTAGE_LETTER_GRADING must synchronize (index according to min and max);
export { GP_LETTER_GRADING, GRADE_POINTS, PERCENTAGE_LETTER_GRADING };