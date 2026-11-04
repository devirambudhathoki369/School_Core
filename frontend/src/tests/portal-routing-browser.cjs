// Run against a built local frontend. Every backend request is mocked; no
// real account, payment, SMS or school mutation is made. Requires Playwright.
// Optional: ROUTING_TEST_URL, PLAYWRIGHT_MODULE, BROWSER_EXECUTABLE.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const seed = require('../../../backend/main/data/help_seed.json');
const BASE = (process.env.ROUTING_TEST_URL || 'http://127.0.0.1:3107').replace(/\/$/, '');
(async () => {
 const browser = await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE ? {executablePath:process.env.BROWSER_EXECUTABLE} : {}),args:['--no-sandbox']});
 try {
 const page=await browser.newPage();
 const errors=[];
 page.on('pageerror', e=>{errors.push(e.message);console.log('PAGE ERROR:',e.message);});
 await page.route('**/*', async route=>{
  const u=new URL(route.request().url());
  if(u.origin===BASE && !u.pathname.startsWith('/api/') && !u.pathname.startsWith('/auth/') && !u.pathname.startsWith('/accounting/')) return route.continue();
  let body=[];
  if(u.pathname.endsWith('/obtain')) body={user:{username:'routing_test',token:'test-only',role:u.pathname.split('/')[2],today:'2083-07-14',profile:{id:999999,name:'Routing test school',education_levels:[1,2,3],economic_year:1,economic_year__name:'2083/84',preferences:{},permissions:[],uses_accounting:true,uses_exams:true}}};
  else if(u.pathname==='/api/help/guides') body={categories:seed.categories,guides:seed.guides};
  else if(u.pathname.includes('academic_year')||u.pathname==='/accounting/economic_year') body=u.pathname.includes('/assign/')?[]:[{id:1,name:'2083',start_date:'2083-01-01',end_date:'2083-12-30',closed:false}];
  else if(u.pathname==='/api/sections') body=[{id:1,section:'A'}];
  else if(u.pathname.includes('classes')) body={};
  await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':BASE,'access-control-allow-credentials':'true','access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'GET,POST,OPTIONS'},body:JSON.stringify(body)});
 });
 await page.goto(BASE + '/admin#manage.sections');
 await page.waitForURL('**/admin/manage/sections');
 await page.getByText('Section',{exact:true}).first().waitFor({timeout:10000}).catch(async e=>{console.log('BODY:',(await page.locator('body').innerText()).slice(0,2000));throw e;});
 assert.equal(new URL(page.url()).hash,'');
 await page.goto(BASE + '/admin/guides');
 await page.getByText('Start here: school setup in the right order',{exact:true}).waitFor();
 // The guide fallback and the database format use the same routing surface.
 await page.getByText('Create sections and classes',{exact:true}).click();
 const link=page.getByRole('link',{name:'Open this page'});
 assert.equal(await link.getAttribute('href'),'/admin/manage/classes');
 await link.click(); await page.waitForURL('**/admin/manage/classes');
 await page.getByText('Setup Class',{exact:true}).waitFor();
 await page.goBack(); await page.waitForURL('**/admin/guides');
 await page.goForward(); await page.waitForURL('**/admin/manage/classes');
 await page.reload(); await page.getByText('Setup Class',{exact:true}).waitFor();
 // Rapid independent link clicks must settle on the final destination.
 await page.goto(BASE + '/admin/guides');
 await page.getByText('Start here: school setup in the right order',{exact:true}).waitFor();
 await page.evaluate(()=>{
  const links=[...document.querySelectorAll('a[href^="/admin/"]')];
  const destinations=['/admin/guides','/admin/support','/admin/guides'];
  for(const dest of destinations) {const link=links.find(a=>a.getAttribute('href')===dest);if(!link)throw new Error('Missing navigation link '+dest);link.click();}
 });
 await page.waitForURL('**/admin/guides');
 await page.getByText('Start here: school setup in the right order',{exact:true}).waitFor();
 await page.goto(BASE + '/admin#exams.seat-plan-old');
 await page.waitForURL('**/admin/exams/seat-plan');
 await page.getByRole('button',{name:'Student photo labels',exact:true}).click();
 await page.getByRole('button',{name:'Student photo labels',exact:true}).getAttribute('aria-pressed').then(value=>assert.equal(value,'true'));
 await page.getByRole('button',{name:'Room seating',exact:true}).click();
 assert.equal(await page.getByRole('link',{name:'Seat plan (old)',exact:true}).count(),0);
 await page.goto(BASE + '/admin#send-sms-absent');
 await page.waitForURL('**/admin/communication/sms/send-messages');
 await page.goto(BASE + '/admin/not-a-page');
 await page.getByText("That page isn't here",{exact:true}).waitFor();
 await page.goto(BASE + '/staff/payment/student');
 await page.getByText("That page isn't here",{exact:true}).waitFor();
 const response=await page.goto(BASE + '/not-a-role/manage/sections');
 assert.equal(response.status(),404);
 assert.deepEqual(errors,[]);
 console.log('Browser routing passed: legacy URL, direct paths, guide links, Back/Forward, refresh, rapid links, unavailable page, invalid role; no page errors. Mock APIs only.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
