import { GP_LETTER_GRADING, GRADE_POINTS, PERCENTAGE_LETTER_GRADING } from "@/configs/letter_grading";
import safeDecimal from "../safeDecimal";
import { isCriteriaValid } from "./entryValidations";

function getTotal(subjects, type) {
    return (subjects || []).reduce((acc, subject) => {
        const total = subject?.criteria?.[type] || 0;
        acc += parseFloat(total);
        return acc;
    }, 0);
}

function getGrading(score, total = null) {
    if (total) score = (score / total) * 100;
    if (score) {
        score = safeDecimal(score);
        try {
            for (const range of PERCENTAGE_LETTER_GRADING) {
                let { min, max } = range;
                min = parseFloat(min) || 0, max = parseFloat(max) || 0;
                if (score >= min && score <= max) return range.grading;
            }
        } catch (e) { }
    }
    return "";
}

function getGPGrading(gp) {
    gp = parseFloat(gp) || 0;
    if (gp < 1) return "NG";
    try {
        for (const range of GP_LETTER_GRADING) {
            let { min, max } = range;
            min = parseFloat(min) || 0, max = parseFloat(max) || 0;
            if (gp > min && gp <= max) return range.grading;
        }
    } catch (e) {
        return "";
    }
}

function getGradePoint(score, total = null) {
    if (total) score = (score / total) * 100;
    if (score) {
        score = safeDecimal(score);
        for (const range of GRADE_POINTS) {
            let { min, max } = range;
            min = parseFloat(min) || 0, max = parseFloat(max) || 0;
            if (score >= min && score <= max) return parseFloat(range.point);
        }
    }
    return 0;
}

// The lowest band the scale awards above zero — read off GRADE_POINTS rather
// than written here, so editing the table cannot leave this behind.
const LOWEST_GRADE_POINT = GRADE_POINTS.reduce((lowest, range) => {
    const point = parseFloat(range.point) || 0;
    return (point > 0 && (lowest === 0 || point < lowest)) ? point : lowest;
}, 0);

/**
 * Grade point for ONE paper, honouring the school's own pass mark.
 *
 * The scale's lowest band starts at 35%, but a school sets its own pass mark
 * and many set it lower — 8 of 25 is 32%, and 16 of 50 is the same. A mark in
 * that window was therefore a pass AND a grade point of 0.0 at the same time,
 * which is not a grade a school can print: the letter cell went blank (the
 * paper was passed, so it is not "NG" either), the grade point read a bare 0,
 * and the subject's final grade quietly fell back to a different formula
 * because `gp_th && gp_pr` was false. 909 half-papers across 26 schools sat in
 * that window.
 *
 * A paper that met its pass mark is worth at least the lowest band. A paper
 * that did NOT — including one with no marks at all — is untouched and still
 * scores 0, so failures and blank entries behave exactly as before.
 */
function getPaperGradePoint(marks, fm, pm) {
    const point = getGradePoint(marks, fm || 1);
    if (point > 0) return point;
    const obtained = parseFloat(marks), passMark = parseFloat(pm);
    const passed = Number.isFinite(obtained) && isCriteriaValid(passMark) && obtained >= passMark;
    return passed ? LOWEST_GRADE_POINT : 0;
}

function getRemarks(score, ranges) {
    try {
        for (const range of ranges) {
            let { min, max } = range;
            min = parseFloat(min) || 0, max = parseFloat(max) || 0;
            if (score >= min && score <= max) return range.remarks;
        }
    } catch (e) { }
    return "";
}

export function finalGP(gp_th, gp_pr, credit_hours, credit_hours_pr) {
    const total_credit_hours = credit_hours + credit_hours_pr;
    gp_th = gp_th * credit_hours;
    gp_pr = gp_pr * credit_hours_pr;
    const gp = gp_th + gp_pr;
    return (gp / total_credit_hours).toFixed(2);
}

export { getTotal, getRemarks, getGrading, getGPGrading, getGradePoint, getPaperGradePoint, LOWEST_GRADE_POINT };