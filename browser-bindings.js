// browser-bindings.js — the ONLY non-1:1 pieces of the userscript port. Everything else in the
// library is the untouched postman.package.js source running against this `pm` shim.
// AUTH POLICY: the userscript NEVER uses a standalone api_key. All requests ride the logged-in
// browser session (fetch credentials:'include'); Authorization/X-API-KEY/SECRET-KEY headers are
// stripped at the transport layer, so even an explicitly passed key never leaves the browser,
// and {{token}} is pinned to a read-only sentinel (set/unset are no-ops) so nothing can store one.
// What exists here and why:
//   pm.sendRequest      — native `fetch` shaped to Postman's callback API; session-cookie auth,
//                         auth headers dropped (see policy above), forbidden headers dropped.
//   pm.collectionVariables / globals / environment — localStorage-backed stores (features cache
//                         etc. survive reloads); 'token' is the session sentinel, not writable.
//   pm.vault            — always empty: no secrets can be seeded, so token()/authenticate()
//                         defaults have nothing to read.
//   __params            — the `query` object: page URL params + stored overrides (r4m.queryOverride),
//                         with `env` defaulting from the hostname (routeml.* -> staging, else prod).
//   require()           — lodash/moment resolve to the page's copy when present, else the Lite
//                         fallbacks below (only the functions the library actually calls).

// --- env: routeml.* is staging, every other matched host is prod; ?env= / queryOverride wins
function __isStagingHost(host) { return /(^|\.)routeml\.com$/i.test(host || location.hostname); }

function __params() {
    var q = {};
    try { new URLSearchParams(location.search).forEach(function (v, k) { q[k] = v; }); } catch (e) {}
    try {
        var over = JSON.parse(localStorage.getItem('r4m.query') || '{}');
        for (var k in over) { if (over[k] != null && over[k] !== '') q[k] = over[k]; }
    } catch (e) {}
    if (!q.env) q.env = __isStagingHost() ? 'staging' : 'prod';
    q.env = String(q.env).toLowerCase();
    return q;
}

// --- localStorage-backed variable store (one JSON blob per namespace) ---------------------------
function __store(nsKey) {
    var read = function () { try { return JSON.parse(localStorage.getItem(nsKey) || '{}'); } catch (e) { return {}; } };
    var write = function (o) { try { localStorage.setItem(nsKey, JSON.stringify(o)); } catch (e) {} };
    return {
        get: function (k) { var o = read(); return Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined; },
        set: function (k, v) { var o = read(); o[k] = v; write(o); },
        unset: function (k) { var o = read(); delete o[k]; write(o); },
        has: function (k) { return Object.prototype.hasOwnProperty.call(read(), k); },
        toObject: function () { return read(); }
    };
}

// --- native fetch, shaped like pm.sendRequest's callback API the library consumes downstream ----
// (resp.code / resp.text() / resp.json() / resp.headers.get()). Body text is pre-read so the
// downstream sync .text()/.json() calls work unchanged. Auth = the browser session cookies
// (credentials:'include'); auth headers are STRIPPED so no standalone key can ever be sent.
var __FORBIDDEN_HEADERS = /^(cookie|host|origin|referer|content-length|connection|accept-encoding|user-agent)$/i;
var __AUTH_HEADERS = /^(authorization|x-api-key|secret-key)$/i;
var __authStripNoted = false;
function __sendRequest(options, cb) {
    try {
        var o = (typeof options === 'string') ? { url: options } : (options || {});
        var method = (o.method || 'GET').toUpperCase();
        var headers = {}, k;
        if (o.header) for (k in o.header) {
            if (o.header[k] == null || o.header[k] === '' || __FORBIDDEN_HEADERS.test(k)) continue;
            if (__AUTH_HEADERS.test(k)) {
                if (!__authStripNoted && String(o.header[k]) !== 'Bearer (browser-session)') {
                    __authStripNoted = true;
                    console.info('r4m: standalone api_key/token auth is disabled in the userscript build — requests use your browser session');
                }
                continue;
            }
            headers[k] = String(o.header[k]);
        }
        var body;
        if (o.body) {
            if (o.body.mode === 'raw') body = o.body.raw;
            else if (o.body.mode === 'urlencoded') {
                var u = o.body.urlencoded;
                body = Array.isArray(u) ? u.map(function (p) { return encodeURIComponent(p.key) + '=' + encodeURIComponent(p.value); }).join('&') : u;
                if (!headers['Content-Type'] && !headers['content-type']) headers['Content-Type'] = 'application/x-www-form-urlencoded';
            } else if (o.body.mode === 'formdata') {
                var fd = new FormData();
                (o.body.formdata || []).forEach(function (p) { fd.append(p.key, p.type === 'file' ? new Blob([String(p.value)]) : String(p.value)); });
                body = fd;
                delete headers['Content-Type']; delete headers['content-type'];   // browser sets the multipart boundary
            } else if (typeof o.body === 'string') body = o.body;
        }
        fetch(o.url, { method: method, headers: headers, body: (method === 'GET' || method === 'HEAD') ? undefined : body, credentials: 'include' })
            .then(function (res) {
                return res.text().then(function (t) {
                    cb(null, {
                        code: res.status, status: res.statusText,
                        text: function () { return t; },
                        json: function () { try { return JSON.parse(t); } catch (e) { return {}; } },
                        headers: { get: function (h) { return res.headers.get(h); } }
                    });
                });
            })
            .catch(function (err) { cb(err); });
    } catch (err) { cb(err); }
}

// --- the pm shim ---------------------------------------------------------------------------------
// {{token}} is pinned: get() returns the session sentinel so the library's auth resolver is
// always satisfied (the resulting Authorization header is stripped in __sendRequest anyway),
// and set/unset are no-ops so no standalone key can be stored.
var __SESSION_TOKEN = '(browser-session)';
var __cv = __store('r4m.cv');
var __cvPinned = {
    get: function (k) { return k === 'token' ? __SESSION_TOKEN : __cv.get(k); },
    set: function (k, v) { if (k !== 'token') __cv.set(k, v); },
    unset: function (k) { if (k !== 'token') __cv.unset(k); },
    has: function (k) { return k === 'token' ? true : __cv.has(k); },
    toObject: function () { var o = __cv.toObject(); o.token = __SESSION_TOKEN; return o; }
};
var pm = {
    sendRequest: __sendRequest,
    collectionVariables: __cvPinned,
    globals: __store('r4m.globals'),
    environment: __store('r4m.env'),
    vault: { get: function () { return Promise.resolve(undefined); } },   // no secrets in the browser
    request: {
        url: {
            query: { toObject: function () { return __params(); } },
            path: location.pathname.split('/').filter(function (p) { return p !== ''; })
        },
        headers: { get: function () { return null; }, upsert: function () {} }
    },
    visualizer: {
        set: function (tpl, data) {
            var rows = data && (data.rows || data.data);
            try { Array.isArray(rows) ? console.table(rows) : console.log('[visualizer]', data); } catch (e) {}
        }
    },
    getData: function (cb) { cb(null, {}); }
    // no pm.cookies / pm.response on purpose: the library optional-chains both, and
    // _domainState prefers document.cookie in a real browser anyway.
};
pm.variables = pm.collectionVariables;

// --- moment Lite: only the calls the library makes (format/add/subtract/from/parseZone) ---------
// UTC-based, matching the "[GMT+0]" labels the library prints. The page's real moment wins.
function __momentLite(input) {
    var d = (input == null) ? new Date() : (input instanceof Date ? input : new Date(typeof input === 'number' ? input : String(input)));
    var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var shift = function (sign, a, b) {
        var n, unit;                                     // supports both (unit, n) and (n, unit)
        if (typeof a === 'number') { n = a; unit = b; } else { n = b; unit = a; }
        n = sign * Number(n || 0);
        unit = String(unit || '').toLowerCase().replace(/s$/, '');
        var nd = new Date(d.getTime());
        if (unit === 'year') nd.setUTCFullYear(nd.getUTCFullYear() + n);
        else if (unit === 'month') nd.setUTCMonth(nd.getUTCMonth() + n);
        else if (unit === 'week') nd.setUTCDate(nd.getUTCDate() + 7 * n);
        else if (unit === 'day') nd.setUTCDate(nd.getUTCDate() + n);
        else if (unit === 'hour') nd.setTime(nd.getTime() + n * 3600000);
        else if (unit === 'minute') nd.setTime(nd.getTime() + n * 60000);
        else if (unit === 'second') nd.setTime(nd.getTime() + n * 1000);
        return __momentLite(nd);
    };
    var M = {
        valueOf: function () { return d.getTime(); },
        toDate: function () { return new Date(d.getTime()); },
        parseZone: function () { return M; },
        utcOffset: function () { return 0; },
        add: function (a, b) { return shift(1, a, b); },
        subtract: function (a, b) { return shift(-1, a, b); },
        format: function (fmt) {
            if (!fmt) return d.toISOString();
            return fmt.replace(/\[([^\]]*)\]|YYYY|MMM|MM|DD|ddd|HH|mm|ss|ZZ/g, function (m, lit) {
                if (lit !== undefined) return lit;
                switch (m) {
                    case 'YYYY': return String(d.getUTCFullYear());
                    case 'MMM': return MONTHS[d.getUTCMonth()];
                    case 'MM': return pad(d.getUTCMonth() + 1);
                    case 'DD': return pad(d.getUTCDate());
                    case 'ddd': return DAYS[d.getUTCDay()];
                    case 'HH': return pad(d.getUTCHours());
                    case 'mm': return pad(d.getUTCMinutes());
                    case 'ss': return pad(d.getUTCSeconds());
                    case 'ZZ': return '+0000';
                    default: return m;
                }
            });
        },
        from: function (other) {
            var ref = (other && typeof other.valueOf === 'function') ? other.valueOf() : Number(other);
            var diff = ref - d.getTime();
            var future = diff < 0, s = Math.abs(diff) / 1000, n, unit;
            if (s < 45) { n = null; unit = 'a few seconds'; }
            else if (s < 2700) { n = Math.round(s / 60); unit = 'minute'; }
            else if (s < 79200) { n = Math.round(s / 3600); unit = 'hour'; }
            else if (s < 2246400) { n = Math.round(s / 86400); unit = 'day'; }
            else if (s < 27993600) { n = Math.round(s / 2592000); unit = 'month'; }
            else { n = Math.round(s / 31536000); unit = 'year'; }
            var phrase = n == null ? unit : (n === 1 ? (unit === 'hour' ? 'an ' : 'a ') + unit : n + ' ' + unit + 's');
            return future ? 'in ' + phrase : phrase + ' ago';
        },
        fromNow: function () { return M.from(Date.now()); }
    };
    return M;
}

// --- lodash Lite: exactly the functions the library calls ----------------------------------------
var __lodashLite = (function () {
    var L = {};
    L.get = function (obj, path, dflt) {
        var ks = Array.isArray(path) ? path : String(path).replace(/\[(\d+)\]/g, '.$1').split('.').filter(function (s) { return s !== ''; });
        var cur = obj;
        for (var i = 0; i < ks.length; i++) { if (cur == null) return dflt; cur = cur[ks[i]]; }
        return cur === undefined ? dflt : cur;
    };
    var iter = function (f) { return typeof f === 'function' ? f : function (r) { return L.get(r, f); }; };
    L.map = function (c, fn) { return Array.prototype.map.call(c, fn); };
    L.delay = function (fn, ms) { var a = [].slice.call(arguments, 2); return setTimeout(function () { fn.apply(null, a); }, ms); };
    L.defer = function (fn) { var a = [].slice.call(arguments, 1); return setTimeout(function () { fn.apply(null, a); }, 1); };
    L.bind = function (fn, ctx) { return Function.prototype.bind.apply(fn, [].slice.call(arguments, 1)); };
    L.sum = function (a) { return (a || []).reduce(function (s, v) { return s + (Number(v) || 0); }, 0); };
    L.mean = function (a) { return a && a.length ? L.sum(a) / a.length : NaN; };
    L.sumBy = function (a, fn) { return L.sum((a || []).map(iter(fn))); };
    L.meanBy = function (a, fn) { return L.mean((a || []).map(iter(fn))); };
    L.min = function (a) { a = (a || []).filter(function (v) { return v != null; }); return a.length ? a.reduce(function (m, v) { return v < m ? v : m; }) : undefined; };
    L.max = function (a) { a = (a || []).filter(function (v) { return v != null; }); return a.length ? a.reduce(function (m, v) { return v > m ? v : m; }) : undefined; };
    L.uniq = function (a) { return Array.from(new Set(a)); };
    L.uniqBy = function (a, fn) { fn = iter(fn); var seen = new Set(), out = []; (a || []).forEach(function (v) { var k = fn(v); if (!seen.has(k)) { seen.add(k); out.push(v); } }); return out; };
    L.sortBy = function (a, fn) {
        fn = fn ? iter(fn) : function (v) { return v; };
        return (a || []).slice().sort(function (x, y) { var vx = fn(x), vy = fn(y); return vx < vy ? -1 : vx > vy ? 1 : 0; });
    };
    L.orderBy = function (a, fns, dirs) {
        fns = (fns || []).map(iter); dirs = dirs || [];
        return (a || []).slice().sort(function (x, y) {
            for (var i = 0; i < fns.length; i++) {
                var vx = fns[i](x), vy = fns[i](y);
                if (vx === vy) continue;
                var c = (vx == null) ? -1 : (vy == null) ? 1 : (vx < vy ? -1 : 1);
                return String(dirs[i]).toLowerCase() === 'desc' ? -c : c;
            }
            return 0;
        });
    };
    L.keyBy = function (a, fn) { fn = iter(fn); var out = {}; (a || []).forEach(function (v) { out[fn(v)] = v; }); return out; };
    L.sample = function (a) { return a && a.length ? a[Math.floor(Math.random() * a.length)] : undefined; };
    L.random = function (lo, hi) { return lo + Math.floor(Math.random() * (hi - lo + 1)); };
    L.chunk = function (a, n) { var out = []; for (var i = 0; i < (a || []).length; i += n) out.push(a.slice(i, i + n)); return out; };
    L.VERSION = 'lite';
    return L;
})();

// --- require shim: page copies win; csv-parse is not bundled ------------------------------------
function require(name) {
    if (/lodash/.test(name)) return (typeof window !== 'undefined' && window._ && window._.VERSION && window._.VERSION !== 'lite' && typeof window._.orderBy === 'function') ? window._ : __lodashLite;
    if (/moment/.test(name)) return (typeof window !== 'undefined' && typeof window.moment === 'function') ? window.moment : __momentLite;
    if (/csv-parse/.test(name)) return function () { throw new Error('csv-parse is not bundled in the userscript build (read_csv/rows unavailable)'); };
    throw new Error('require("' + name + '") is not available in the userscript build');
}
