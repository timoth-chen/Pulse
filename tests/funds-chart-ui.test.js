const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const plan = fs.readFileSync(path.join(root, 'public/funds-plan.js'), 'utf8');
const quick = fs.readFileSync(path.join(root, 'public/funds-quick.js'), 'utf8');
const profile = fs.readFileSync(path.join(root, 'public/profile-arrival.js'), 'utf8');
const design = fs.readFileSync(path.join(root, 'public/pulse-design.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');

test('Funds Check keeps the interactive forecast decision tools', () => {
  for (const capability of [
    'data-funds-baseline',
    'funds-threshold-zero',
    'funds-threshold-buffer',
    'funds-event-marker',
    'funds-minimum-marker',
    'onpointermove',
    'svg.onclick=pick',
    'svg.onkeydown',
  ]) assert.match(plan, new RegExp(capability.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('SPA navigation initializes saved Funds Check setup before drawing', () => {
  const wrapper = quick.slice(quick.indexOf('const loadCoverageBeforeFundsForecast'), quick.indexOf('async function runFundsQuickCheck'));
  assert.match(wrapper, /await loadCoverageBeforeFundsForecast\(\)/);
  assert.match(wrapper, /await initFundPlan\(\)/);
  assert.ok(wrapper.indexOf('await initFundPlan()') < wrapper.indexOf('await refreshFundsForecast()'));
});

test('editing assumptions preserves the prior graph while marking it stale', () => {
  const dirty = quick.match(/function dirtyFundsSetup\(\)\{[^\n]+/)[0];
  assert.match(dirty, /markFundsForecastStale/);
  assert.doesNotMatch(dirty, /fcQuickResults.*innerHTML/);
  assert.match(design, /#fcQuickResults\.is-stale/);
});

test('profile arrival protects previous financial data and respects reduced motion', () => {
  assert.match(profile, /profile-arrival-backdrop/);
  assert.match(profile, /profileSignInBusy/);
  assert.match(design, /prefers-reduced-motion:reduce/);
  assert.match(design, /\.profile-arrival-backdrop/);
});

test('Slate and Indigo browser chrome and fresh service worker are configured', () => {
  assert.match(app, /'#151722'\s*:\s*'#f5f6fa'/);
  assert.match(app, /updateViaCache:'none'/);
  assert.match(sw, /household-finance-v221/);
});

test('dashboard Funds Check owns one in-place interactive scenario flow', () => {
  assert.equal((quick.match(/\$\('quickCheckBtn'\)\.onclick/g)||[]).length, 1);
  assert.match(quick, /runDashboardFundsCheck/);
  assert.match(quick, /dashboardFundsDays/);
  assert.match(quick, /dashboardFundsReset/);
  assert.match(quick, /event\.key==='Enter'/);
  assert.doesNotMatch(plan, /\$\('quickCheckBtn'\)\.onclick/);
  assert.doesNotMatch(app, /\$\('quickCheckBtn'\)\.onclick/);
});

test('forecast chart uses stepped balances and on-line semantic markers', () => {
  assert.match(plan, /H\$\{x\(index\)\}V\$\{y\(row\.balance\)\}/);
  assert.match(plan, /funds-balance-purchase/);
  assert.match(plan, /markerLimit/);
  assert.match(plan, /cy="\$\{y\(row\.balance\)\}"/);
  assert.doesNotMatch(plan, /y2="\$\{plotHeight\+25\}"/);
});

test('quick purchase assumptions refresh the prominent forecast', () => {
  assert.match(quick, /id="fcQuickPurchaseDate"/);
  assert.match(quick, /date:\$\('fcQuickPurchaseDate'\)\.value/);
  assert.match(quick, /fcQuickPurchaseDate'\)\.onchange=.*refreshFundsForecast/);
  assert.match(quick, /fcForecastDays'\)\.onchange=refreshFundsForecast/);
  assert.match(quick, /fcPurchaseAccount'\)\.onchange/);
  assert.match(quick, /funds-forecast-panel/);
  assert.match(quick, /Estimated/);
  assert.match(quick, /Confirmed/);
});

