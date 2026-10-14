from decimal import Decimal

#
from ...constants.letter_grade import (
    GP_LETTER_GRADING,
    GRADE_POINTS,
    PERCENTAGE_LETTER_GRADING,
)


class ResultCalculation:
    def calculatePercentage(self, score, total) -> Decimal:
        if not score or not total:
            return 0
        score, total = Decimal(score or 0), Decimal(total or 1)
        return round(((score / total) * 100), 2)

    def getMinMaxFromRange(self, range):
        min, max = range.get("min"), range.get("max")
        return (min, max)

    def getGrading(self, score, total=None):
        if total:
            score = (score / total) * 100
        if score:
            try:
                for range in PERCENTAGE_LETTER_GRADING:
                    min, max = self.getMinMaxFromRange(range)
                    if score >= min and score <= max:
                        return range.get("grading")
            except:
                pass
        return ""

    def getGPGrading(self, gp):
        gp = float(gp) or 0
        if gp < 1:
            return "NG"
        try:
            for range in GP_LETTER_GRADING:
                min, max = self.getMinMaxFromRange(range)
                if gp > min and gp <= max:
                    return range.get("grading")
        except:
            return ""

    def getGradePoint(self, score, total=None):
        if total:
            score = self.calculatePercentage(score, total)
        if score:
            for range in GRADE_POINTS:
                min, max = self.getMinMaxFromRange(range)
                if score >= min and score <= max:
                    return Decimal(range.get("point"))
        return 0

    def finalGradePoint(self, gp_th, gp_pr, credit_hours, credit_hours_pr):
        total_credit_hours = credit_hours + credit_hours_pr
        gp_th = gp_th * credit_hours
        gp_pr = gp_pr * credit_hours_pr
        gp = gp_th + gp_pr
        return round(gp / total_credit_hours, 2)

    def calculateGPA(self, sum_of_weighted_grade_point, sum_of_credit_hours):
        # no marks entered yet (or no credit hours set) -> nothing to average
        if not sum_of_credit_hours:
            return 0
        return round((sum_of_weighted_grade_point / sum_of_credit_hours), 2)

    def getRemarks(self, score, ranges):
        try:
            for range in ranges:
                min, max = self.getMinMaxFromRange(range)
                if score >= float(min) and score <= float(max):
                    return range.get("remarks")
        except:
            pass
        return ""
