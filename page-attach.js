// page-attach.js — runs after the library populated module.exports (inside the injected page fn).
// Exposes window.r4m (full export surface) and promotes getInfo + the listing helpers to bare
// globals when the page hasn't claimed the name.
// AUTH: there is deliberately NO r4m.auth()/vault — the userscript build never uses a standalone
// api_key; every request rides the logged-in browser session (see browser-bindings.js).
// Browser-only convenience:
//   r4m.queryOverride(k, v)  persist a query override (env/debug/member_id…) — applies on reload
var r4m = module.exports;

// token auth does not exist in the userscript build — session cookies only. These exports are
// inert here anyway (vault is always empty, auth headers are stripped), so drop them entirely
// rather than expose dead surface.
['token', 'authenticate', 'clearAuth', 'vault'].forEach(function (n) { delete r4m[n]; });

r4m.queryOverride = function (k, v) {
    var o; try { o = JSON.parse(localStorage.getItem('r4m.query') || '{}'); } catch (e) { o = {}; }
    if (v == null) delete o[k]; else o[k] = String(v);
    localStorage.setItem('r4m.query', JSON.stringify(o));
    return 'query.' + k + (v == null ? ' cleared' : ' = ' + v) + ' — reload the page to apply';
};
r4m.pm = pm;   // escape hatch: the store shims (globals, query overrides)

window.r4m = r4m;

// bare-global promotion: getInfo + every listing helper (+ their one()/describe conveniences).
// A name already used by the page is skipped — it's still reachable as r4m.<name>.
var PROMOTE = [
    'getInfo', 'getAdminPanelLink', 'getRecurlyLink',
    'users', 'team', 'crews', 'vehicles', 'vehicle_profiles', 'vehicle_capacity_profiles',
    'equipment_types', 'break_profiles', 'optimization_profiles', 'orders', 'addresses',
    'locations', 'customers', 'assets', 'contracts', 'route_relations', 'workflows',
    'releases', 'service_types', 'work_schedules', 'schedules', 'skills', 'facilities',
    'region_types', 'regions', 'avoidence_zones', 'territories', 'route', 'routes',
    'destinations', 'profile', 'menu', 'subscription', 'user_features',
    'one', 'order', 'customer', 'address', 'facility', 'describe', 'from',
    'select_facilities', 'fetch_combined'
];
var skipped = [];
PROMOTE.forEach(function (n) {
    if (typeof r4m[n] !== 'function') return;
    if (window[n] === undefined) window[n] = r4m[n]; else skipped.push(n);
});

console.info('r4m ready [' + __params().env.toUpperCase() + '] — auth = your logged-in browser session. Try: await getInfo()  |  await users()  |  r4m.*');
if (skipped.length) console.info('r4m: page already defines ' + skipped.join(', ') + ' — use r4m.<name> for those');
