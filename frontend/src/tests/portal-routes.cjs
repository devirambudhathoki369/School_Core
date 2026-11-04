const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const api = {};
new Function('exports', ts.transpileModule(fs.readFileSync(path.join(__dirname, '../methods/portalRoutes.js'), 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText)(api);
const {portalHref, portalView, portalPath, portalRole, navigatePortal} = api;
(async () => {
    for (const role of api.PORTAL_ROLES) {
        for (const view of ['manage.sections', 'accounting.reports.day-book', 'guides']) {
            const url = portalPath(role, view);
            assert.equal(portalView(url), view);
            assert.equal(portalRole(url), role);
            assert.equal(portalHref(`#${view}`, `/${role}/dashboard`), url);
            assert.equal(portalHref(`/${role}#${view}`), url);
            assert.equal(portalHref(`${role}#${view}`), url);
        }
    }
    assert.equal(portalHref('/admin?filter=1#manage.sections'), '/admin/manage/sections?filter=1');
    assert.equal(portalView('/admin/manage/sections?filter=1'), 'manage.sections');
    assert.equal(portalHref('#contact', '/'), '#contact');
    assert.equal(portalHref('https://example.org/#manage.sections', '/admin'), 'https://example.org/#manage.sections');
    assert.equal(portalHref('/features#accounting', '/admin'), '/features#accounting');
    assert.equal(portalHref('#../outside', '/admin'), '#../outside');
    assert.equal(portalRole('//example.org/admin'), null);
    assert.equal(portalView('/admin'), '');
    for (const [oldView, currentView] of Object.entries(api.LEGACY_VIEWS)) {
        assert.equal(portalHref(`/admin#${oldView}`), portalPath('admin', currentView));
        assert.equal(portalHref('/admin/' + oldView.replaceAll('.', '/')), portalPath('admin', currentView));
        assert.equal(portalView('/staff/' + oldView.replaceAll('.', '/')), currentView);
    }
    assert.equal(portalHref('/admin/app/attendance/report?month=1'), '/admin/attendance/report?month=1');
    assert.equal(portalHref('/staff#app.rfid.attd-logs'), '/staff/attendance/rfid/attd-logs');
    const calls = [];
    const router = {asPath: '/staff/dashboard', push: async (...args) => {calls.push(args); return true;}, replace: async (...args) => {calls.push(args); return true;}};
    await navigatePortal(router, '#manage.sections');
    assert.deepEqual(calls.pop(), ['/staff/manage/sections', undefined, {shallow: true, scroll: false}]);
    await navigatePortal(router, '/superadmin#guides', {replace: true});
    assert.deepEqual(calls.pop(), ['/superadmin/guides', undefined, {shallow: false, scroll: true}]);
    assert.equal(await navigatePortal(router, router.asPath), true);
    assert.equal(calls.pop()[0], router.asPath);
    router.push = async () => {throw Object.assign(new Error('Cancel rendering route'), {cancelled: true});};
    assert.equal(await navigatePortal(router, '#manage.sections'), false);
    router.push = async () => {throw new Error('Real routing failure');};
    await assert.rejects(navigatePortal(router, '#manage.sections'), /Real routing failure/);
    console.log('Portal routes: roles, legacy links, queries, public links and cancellation checks passed.');
})().catch(error => {console.error(error); process.exitCode = 1;});
