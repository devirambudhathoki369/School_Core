import { getYearFromDate } from "@/methods/extractYear";
import { useState } from "react";

const useFiscalYears = () => {
    const [years, setYears] = useState({ academicYears: [], accountingEconomicYears: [] });
    const [mappedYears, setMappedYears] = useState({ academicYears: {}, accountingEconomicYears: {} });
    const [year, setYear] = useState({
        economic_year: '', academic_year: '', accounting_economic_year: '',
        economic_year_name: '', academic_year_name: '', accounting_economic_year_name: '',
    });
    const [fyKeys, setFYKeys] = useState({});
    const [assignedAcademicYears, setAssignedAcademicYears] = useState({});

    function getAcademicYearKey(user) {
        return (user?.profile?.school_uname || user?.username || '').toLowerCase() + '__academic_year';
    }
    function getAccountingEconomicYearKey(user) {
        return (user?.profile?.school_uname || user?.username || '').toLowerCase() + '__accounting_economic_year';
    }
    function getYear(key) {
        return parseInt(localStorage.getItem(key) || '');
    }
    function getAcademicYearName(academic_year, academicYears = []) {
        return (academicYears || years?.academicYears || []).find(yr => yr.value === academic_year)?.name || '';
    }
    function getAccountingEconomicYearName(accounting_economic_year, accountingEconomicYears = []) {
        return (accountingEconomicYears || years?.accountingEconomicYears || [])
            .find(yr => yr.value === accounting_economic_year)?.name || '';
    }
    function saveYears({ academicYears, closedAcademicYears, accountingEconomicYears, closedAccountingEconomicYears }) {
        // `accountingEconomicYears` stays OPEN-only (the closing page lists it as
        // "Running" years). `allAccountingEconomicYears` = open + closed, used by
        // reports / transaction history / entry pages to view past (read-only) years.
        const _options = { academicYears: [], closedAcademicYears: [], accountingEconomicYears: [], allAccountingEconomicYears: [] };
        const _mapped = { academicYears: {}, closedAcademicYears: [], accountingEconomicYears: {}, allAccountingEconomicYears: {} };
        (academicYears || []).forEach(year => {
            _options.academicYears.push({ name: year.name, value: year.id });
            _mapped.academicYears[year.id] = year;
        });
        (closedAcademicYears || []).forEach(year => {
            _options.closedAcademicYears.push({ name: year.name, value: year.id });
            _mapped.closedAcademicYears[year.id] = year;
        });
        (accountingEconomicYears || []).forEach(year => {
            _options.accountingEconomicYears.push({ name: year.name, value: year.id });
            _mapped.accountingEconomicYears[year.id] = year;
            _options.allAccountingEconomicYears.push({ name: year.name, value: year.id });
            _mapped.allAccountingEconomicYears[year.id] = { ...year, closed: false };
        });
        (closedAccountingEconomicYears || []).forEach(year => {
            _options.allAccountingEconomicYears.push({ name: `${year.name} (closed)`, value: year.id });
            _mapped.allAccountingEconomicYears[year.id] = { ...year, closed: true };
        });
        setYears(_options);
        setMappedYears(_mapped);
        return _options;
    }

    // is a given accounting economic year closed (read-only)? unknown -> false.
    function isAccountingYearClosed(accounting_economic_year) {
        return !!mappedYears?.allAccountingEconomicYears?.[accounting_economic_year]?.closed;
    }

    /**
     * The accounting year a screen should OPEN on when the app has no active one.
     *
     * `year.accounting_economic_year` is read out of localStorage, and it is
     * empty until somebody has been into the top-right fiscal-year picker and
     * chosen a year on THAT browser. So a fresh machine, a cleared profile or a
     * member of staff signing in for the first time lands on an accounting
     * screen with a blank Fiscal Year box and a disabled Search button, with
     * nothing on the page saying which year it wanted.
     *
     * There is no need to ask. The year is a fact about the school and the
     * date: the one whose range contains today. Falling back to it does not
     * override a choice — it only fills a hole where there was no choice.
     *
     * Nepali dates arrive zero-padded ("2083-05-04"), so a string compare IS a
     * date compare: no parsing, no BS/AD conversion, no timezone.
     *
     * When no year contains today the newest one is returned instead. Both
     * halves of that happen in production: a school that has not opened this
     * year's books yet, and a school whose year carries the `03-32` end_date
     * typo, which no date can fall inside.
     */
    function getCurrentAccountingEconomicYear(today = '') {
        const rows = Object.values(mappedYears?.allAccountingEconomicYears || {})
            .filter(yr => yr?.id);
        if (!rows.length) return '';
        const current = today && rows.find(
            yr => yr?.start_date && yr?.end_date &&
                yr.start_date <= today && today <= yr.end_date
        );
        if (current) return current.id;
        const newest = rows.reduce(
            (latest, yr) => ((latest?.start_date || '') > (yr?.start_date || '') ? latest : yr)
        );
        return newest?.id || '';
    }

    function getYearFromAcademicYear(academic_year) {
        let group = mappedYears?.["academicYears"];
        if (!group?.[academic_year]) group = mappedYears?.["closedAcademicYears"];
        const date = group?.[academic_year]?.start_date || "";
        return getYearFromDate(date);
    }
    function getNameFromAcademicYear(academic_year) {
        let group = mappedYears?.["academicYears"];
        if (!group?.[academic_year]) group = mappedYears?.["closedAcademicYears"];
        const name = group?.[academic_year]?.name || "";
        return name;
    }
    function getAcademicYearObject(academic_year) {
        let group = mappedYears?.["academicYears"];
        if (!group?.[academic_year]) group = mappedYears?.["closedAcademicYears"];
        const object = group?.[academic_year] || {};
        return object;
    }

    return {
        fiscalYear: {
            fyKeys, setFYKeys, years, mappedYears, year, setYear, getYear, setYears, saveYears, getAcademicYearKey,
            getAccountingEconomicYearKey, assignedAcademicYears, setAssignedAcademicYears,
            getAcademicYearObject, getAcademicYearName, getAccountingEconomicYearName,
            getYearFromAcademicYear, getNameFromAcademicYear, isAccountingYearClosed,
            getCurrentAccountingEconomicYear
        }
    };
};

export default useFiscalYears;