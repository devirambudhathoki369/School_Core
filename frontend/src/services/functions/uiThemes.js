import { __fetch, __update } from ".";

const MANAGE = "/api/manage/ui-themes";

// superadmin: every school with its interface theme, plus the list of themes to
// choose from, so the picker never keeps its own copy of the options to drift
// out of step with the backend's validator.
export async function getAllUiThemes() {
    const data = await __fetch(MANAGE, {});
    return {
        schools: Array.isArray(data?.schools) ? data.schools : [],
        themes: Array.isArray(data?.themes) ? data.themes : [],
    };
}

// A school reads its own theme from its profile (it rides along with the login
// payload), so there is deliberately no per-school fetch here to keep in step.
export async function saveUiTheme(school, ui_theme) {
    return __update(MANAGE, { school, ui_theme }, false);
}
