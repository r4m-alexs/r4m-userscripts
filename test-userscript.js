#!/usr/bin/env node
// Offline smoke test for the generated userscript (r4m-helpers.user.js).
// Stubs the browser surface (window/document/localStorage/GM_xmlhttpRequest), runs the
// userscript body, then drives a listing helper and getInfo end-to-end against canned
// responses — asserting the transport policy (all HTTP via GM_xmlhttpRequest, never the
// CORS-bound fetch fallback) and the auth policy (session cookies only, no standalone api_key).
const fs = require('fs');
const path = require('path');
const assert = require('assert');

// --- browser stubs -------------------------------------------------------------------------
const store = new Map();
global.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    key: (i) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; }
};
global.location = { hostname: 'go.routeml.com', search: '?debug=', pathname: '/some/page', href: 'https://go.routeml.com/some/page' };
global.document = {
    cookie: 'session_id=abc123; jwt=eyJh.pay=load%3D; empty=; XSRF-TOKEN=xsrf%3Dtok123',   // embedded '=' + url-encoding
    querySelector: () => null,
    createElement: () => ({ id: '', type: '', textContent: '' }),
    body: { appendChild: () => {} }
};
global.window = global;
global.FormData = class { append() {} };
global.Blob = class { constructor() {} };

// all HTTP must go through GM_xmlhttpRequest (the CORS-free path) — fetch is the page-realm
// fallback and would be CORS-blocked in the real browser, so here it hard-fails the test
const calls = [];
global.fetch = async (url) => { throw new Error('CORS: fetch fallback must not be used (' + url + ')'); };
global.GM_xmlhttpRequest = (req) => {
    calls.push(req);
    let json = {};
    const url = req.url;
    if (/profile-api/.test(url)) json = { member_id: 42, member_email: 'qa@route4me.com', root_member_id: 42, timezone: 'UTC' };
    else if (/validate_session/.test(url)) json = { member_id: 42, member_email: 'qa@route4me.com' };
    else if (/configuration-settings/.test(url)) json = { OWNER_MEMBER_ID: 42 };
    else if (/facilities\/select/.test(url)) json = { status: true };
    else if (/combined|list/.test(url)) json = { data: { items: [{ member_id: 42, member_email: 'qa@route4me.com' }], total_items_count: 1 } };
    setTimeout(() => req.onload({
        status: 200, statusText: 'OK',
        responseText: JSON.stringify(json),
        responseHeaders: 'Content-Type: application/json\r\nX-Test: 1'
    }), 0);
};

// qa-password is no longer hardcoded — it comes from the `qa-password` env var. Seed a throwaway
// TEST value (NOT the real QA password) before load so DEFAULT_PASSWORD resolves to it.
const QA_PW = 'test-qa-pw';
global.localStorage.setItem('r4m.env', JSON.stringify({ 'qa-password': QA_PW }));

// --- run the userscript body (metadata stripped) ---------------------------------------------
const out = fs.readFileSync(path.join(__dirname, 'r4m-helpers.user.js'), 'utf8');
const body = out.slice(out.indexOf('(function () {'));
(0, eval)(body);

(async () => {
    assert.ok(window.r4m, 'window.r4m exists');
    assert.strictEqual(typeof window.r4m.getInfo, 'function', 'r4m.getInfo is a function');
    assert.strictEqual(typeof window.getInfo, 'function', 'getInfo promoted to a bare global');
    assert.strictEqual(typeof window.users, 'function', 'users promoted to a bare global');

    // env detection: routeml.com host -> staging
    assert.strictEqual(window.r4m.pm.request.url.query.toObject(true).env, 'staging', 'env auto-detected as staging');

    // listing helper end-to-end (normalized {by_id, by_name, list, total} shape)
    const u = await window.users();
    assert.ok(u && Array.isArray(u.list), 'users() returned a normalized list');
    assert.strictEqual(u.total, 1, 'users() total from total_items_count');
    assert.strictEqual(u.list[0].member_email, 'qa@route4me.com', 'users() item passthrough');

    // getInfo end-to-end (aligned TSV, always-on keys present)
    const info = await window.getInfo({ log: false });
    assert.ok(/^env\)\tSTAGING/m.test(info), 'getInfo reports env');
    assert.ok(/member_email\)\tqa@route4me\.com/.test(info), 'getInfo merged profile fields');
    assert.ok(/admin_link\)\thttps:\/\/root\.admin-panel\.routeml\.com/.test(info), 'getInfo computed admin_link');
    assert.ok(new RegExp('member_password\\)\\t' + QA_PW).test(info), 'getInfo defaults member_password to the configured qa-password');
    assert.strictEqual(window.r4m.DEFAULT_PASSWORD, QA_PW, 'DEFAULT_PASSWORD resolves from the qa-password env var');
    // cookies split into name:value pairs — first '=' only (values may embed '='), url-decoded
    assert.ok(info.includes('cookies)\t{session_id:abc123,jwt:eyJh.pay=load=,empty:,XSRF-TOKEN:xsrf=tok123}'), 'cookies string split properly: ' + (info.match(/^cookies\).*$/m) || [''])[0]);

    // the query filters ALL property names uniformly — no always-on keys
    const filtered = await window.getInfo({ query: 'member_id|member_api_key|member_email|qa_mode', log: false });
    assert.ok(!/^cookies\)/m.test(filtered), 'filtered getInfo omits cookies');
    assert.ok(!/^localstorage_keys\)/m.test(filtered), 'filtered getInfo omits localstorage_keys');
    assert.ok(!/^env\)/m.test(filtered) && !/^profile\)/m.test(filtered), 'env/profile are filterable too (no always-on keys)');
    assert.ok(/^member_email\)/m.test(filtered) && /^member_id\)/m.test(filtered), 'matched keys are kept');
    const cookiesOnly = await window.getInfo({ query: 'cookies', log: false });
    assert.ok(/^cookies\)/m.test(cookiesOnly), 'asking for cookies explicitly still returns them');
    assert.ok(!/^member_email\)/m.test(cookiesOnly), 'and nothing unmatched comes with them');

    // --- transport & auth policy: GM_xmlhttpRequest with cookies, standalone api_key impossible --
    assert.ok(calls.length > 0, 'requests were made');
    for (const c of calls) {
        assert.strictEqual(c.anonymous, false, 'every request sends the target-domain session cookies');
        for (const h of Object.keys(c.headers || {})) {
            assert.ok(!/^(authorization|x-api-key|secret-key)$/i.test(h), 'no auth header leaves the browser (' + h + ' on ' + c.url + ')');
        }
    }
    // CSRF: every non-GET echoes the page's XSRF-TOKEN cookie (Laravel 419 fix)
    const posts = calls.filter((c) => !/^(GET|HEAD)$/.test(c.method));
    assert.ok(posts.length > 0, 'POST requests were made (magic-login / facilities select)');
    for (const c of posts) {
        assert.strictEqual((c.headers || {})['X-XSRF-TOKEN'], 'xsrf=tok123', 'non-GET carries X-XSRF-TOKEN (' + c.url + ')');
    }
    for (const c of calls.filter((x) => /^(GET|HEAD)$/.test(x.method))) {
        assert.strictEqual((c.headers || {})['X-XSRF-TOKEN'], undefined, 'GETs skip the CSRF header (' + c.url + ')');
    }
    assert.strictEqual(window.r4m.auth, undefined, 'no r4m.auth — standalone keys cannot be set');
    assert.strictEqual(window.r4m.vaultSet, undefined, 'no r4m.vaultSet — secrets cannot be seeded');
    for (const n of ['token', 'authenticate', 'clearAuth', 'vault']) {
        assert.strictEqual(window.r4m[n], undefined, 'token-auth surface removed from exports (' + n + ')');
        assert.strictEqual(window[n], undefined, 'token-auth surface not promoted to a global (' + n + ')');
    }
    window.r4m.pm.collectionVariables.set('token', 'ffffffffffffffffffffffffffffffff');
    assert.strictEqual(window.r4m.pm.collectionVariables.get('token'), '(browser-session)', '{{token}} is pinned to the session sentinel');
    assert.ok(!(localStorage.getItem('r4m.cv') || '').includes('ffff'), 'no key material persisted to localStorage');

    // even an explicitly passed api_key must not be sent
    const before = calls.length;
    await window.users({ api_key: 'ffffffffffffffffffffffffffffffff' });
    for (const c of calls.slice(before)) {
        const joined = JSON.stringify(c.headers || {});
        assert.ok(!joined.includes('ffffffffffffffffffffffffffffffff'), 'explicit api_key argument is stripped at the transport layer');
    }

    console.log(`✓ userscript smoke test passed (${calls.length} GM_xmlhttpRequest calls, CORS-free, session-cookie auth only)`);
})().catch((e) => { console.error('✗ ' + (e.stack || e)); process.exit(1); });
