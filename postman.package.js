let     query = pm.request.url.query.toObject(true),
        path = pm.request.url.path,
        response = pm?.response?.headers.get('Content-Type')?.match('application/json') ? pm?.response?.json() : pm?.response?.text(),
        PROD = query.env === 'prod',
        DEBUG = () => query?.debug ? query?.debug?.split(',')?.map(q => q.trim()) : [],
        INCLUDE = (verb) => query?.include && query?.include?.split(',')?.map(q => q.trim())?.includes(verb) ? true : false,
        creds = pm.globals.get('setBillingCreds') ? JSON.parse(pm.globals.get('setBillingCreds')) : {}; 
const   moment = require('moment')
const parse = require('csv-parse/lib/sync');
const _ = require('lodash');

function read_csv(csv, delimeter=',') {
    let output = parse(csv, {
        relax_column_count: true,
        skip_empty_lines: true,
        columns: true,
        trim: true,
        delimiter: delimeter,
        record_delimiter: '\n'
    })
    return output;
};
const rows = read_csv;

let request = async ({ 
        url = null, 
        method = 'GET', 
        authtype = null, 
        apikey = null, 
        source = null, 
        headers = {}, 
        bodyformat = 'raw', 
        body = null, 
        storage = null, 
        cookies = {}, 
        responseFormat = 'json', 
        encapsulated = null, 
        parse = 'json', 
        dryrun = false, 
        wait = 0, 
        debug = ['curl'], 
        getheaders = false, 
        bodyFormat,
        auth_type,
        body_format,
        auth = {},
        iteration=null,
        sensitive = false,
        retries = 2,
        retryOn = [429, 500, 502, 503, 504]
    } = {}) => {

    bodyformat = body_format || bodyFormat || bodyformat;
    authtype = auth_type || authtype || null;   // checks below read `authtype`; accept the `auth_type` alias too
    apikey = apikey || null;

    let error = false;

    try {

    function processData(d) {
        const MAX_SAFE_INT = Number.MAX_SAFE_INTEGER;

        function deepProcess(value) {
            if (Array.isArray(value)) {
                return value.map(deepProcess);
            } else if (value && typeof value === 'object') {
                const processedObject = {};
                for (const key in value) {
                    if (value.hasOwnProperty(key)) {
                        processedObject[key] = deepProcess(value[key]);
                    }
                }
                return processedObject;
            } else if (typeof value === 'number') {
                if (value > MAX_SAFE_INT) return value.toString();
                else return value
            } else {
                return value;
            }
        }
        return deepProcess(d);
    }

    let getValue = ({ data, key } = {}) => {
        if (data === null || data === undefined || !key) return null;
        let splitter = key?.match('.') ? '.' : '/';
        let keys = key.split(splitter).filter(k => k != '');
        let deep = 0;
        const deeper = (data, ks, deep) => {
            if (data && ks && ks.length === 1) {
                if (Array.isArray(data)) {
                    return data.map(e => e[ks[0]]);
                } else if (typeof data == 'object' && !Array.isArray(data) && data !== null) {
                    return data[ks[0]];
                } else {
                    return null;
                }
            } else if (ks && ks.length > 1) {
                let ksShifted = [...ks];
                ksShifted.shift();
                if (Array.isArray(data)) {
                    return data.map(e => deeper(e[ks[0]], ksShifted, deep + 1))
                } else if (typeof data == 'object' && !Array.isArray(data) && data !== null) {
                    return deeper(data[ks[0]], ksShifted, deep + 1)
                } else {
                    return null;
                }
            } else {
                return null;
            }
        }
        return deeper(data, keys, deep);
    }

    let options = {
        url: url,
        method: method,
        header: {}
    },
    output = { 'response': null, 'request_source': {} };
    if (cookies) options.header['Cookie'] = typeof cookies === 'object' ? Object.entries(cookies).map(([k, v]) => k + '=' + encodeUrlComponent(v)).join('; ') : cookies;

    if (body !== null && bodyformat === 'raw') {
        options.body = {
            mode: 'raw',
            raw: JSON.stringify(body)
        };
        options.header['Content-Type'] = 'application/json';
    } else if (body != {} && bodyformat === 'formdata') {
        options.body = {
            mode: 'formdata',
            formdata: Object.entries(body).map(([k, v]) => { return { key: k, value: v }; })
        };
    } else if (body != {} && bodyformat === 'formdata-csv') {
        options.body = {
            mode: 'formdata',
            formdata: [
                {'key': 'strFilename', 'value': csv({data: body}), type: 'file'}
            ]
        };
    } else if (body != {} && bodyformat === 'urlencoded') {
        // Postman encodes the {key,value} array; the Insomnia adapter encodes it to a string for fetch.
        options.body = {
            mode: 'urlencoded',
            urlencoded: Object.entries(body).map(([key, value]) => ({ key, value: String(value) }))
        };
        options.header['Content-Type'] = 'application/x-www-form-urlencoded';
    }
    options.header['Accept'] = 'application/json';

    // Bearer request with no key supplied -> auto-resolve: token auth first, then api_key auth.
    // (Gated to 'bearer' so token()'s own SECRET-KEY request can't recurse back in here.)
    if (apikey == null && authtype === 'bearer') apikey = await resolveApiKey(null, null);

    if (apikey == null && (authtype != 'none' && authtype != null)) {
        throw new Error('No API key specified');
    }
    if (authtype == 'apikey') {
        //if (url?.match(/\?/)) options.url = url + '&api_key=' + apikey;
        options.header['X-API-KEY'] = apikey;
    }
    if (authtype == 'secret') {
        //if (url?.match(/\?/)) options.url = url + '&api_key=' + apikey;
        options.header['SECRET-KEY'] = apikey;
    }    
    if (authtype == 'bearer') {
        //if (url?.match(/\?/)) options.url = url + '&api_key=' + apikey;
        options.header.Authorization = 'Bearer ' + apikey;
    } else {
    }
    options.header['X_R4M_TEST_ID'] = 'alexs@route4me.com';
    if (headers) Object.assign(options.header, headers)

    if (wait > 0) await new Promise(resolve => { return setTimeout(resolve, wait); })

    return new Promise((resolve, reject) => {
        let curlWithTrash, curlWithoutTrash, 
            curl = `curl --location --request ${method} '${options.url}'`;
        Object.entries(options.header).forEach(([headerKey, headerValue]) => {
            curl += ` --header '${headerKey}: ${headerValue}'`
        });
        
        curlWithTrash = curl;
        curlWithoutTrash = curl;
        if (body) {
            if (bodyformat === 'urlencoded') {
                // form-encoded: one --data-urlencode per field, matching the actual request (and a real curl)
                let pairs = Object.entries(body).map(([k, v]) => ` --data-urlencode '${k}=${String(v).replace(/(['])/g, "\\$1")}'`).join('');
                curlWithTrash += pairs;
                curlWithoutTrash += pairs;
            } else {
                let curlBody = JSON.parse(JSON.stringify(body));
                curlWithTrash += ` --data-raw '${JSON.stringify(curlBody).replace(/(['])/g, "\\$1")}'`; //[.,\/#!$%^&*:{}=\-_`~()\\]
                if (curlBody.addresses) curlBody.addresses = curlBody.addresses.map(a => {
                    delete a.custom_fields;
                    return a;
                })
                curlWithoutTrash += ` --data-raw '${JSON.stringify(curlBody).replace(/(['])/g, "\\$1")}'`; //[.,\/#!$%^&*:{}=\-_`~()\\]
            }
        }
        if (!debug) debug = []
        if (!Array.isArray(debug)) debug = debug.split(',').map(d => d.trim()).filter(d => d);
        // URL query debug flags (?debug=curl,body,...) apply to EVERY request. Sensitive requests
        // (token/authenticate) never print by DEFAULT, but DO honor an explicit ?debug= (Postman still
        // masks vault secrets in the console). So ?debug=curl really returns curls for all requests.
        let qd = DEBUG();
        if (sensitive) debug = (qd && qd.length) ? qd.slice() : [];
        else if (qd && qd.length) debug = Array.from(new Set([...debug, ...qd]));
        let debugPropsInRequest = {};
        if (debug.includes('request')) debugPropsInRequest['REQUEST'] = options;
        if (debug.includes('request headers')) debugPropsInRequest['REQUEST HEADERS'] = options.header;
        if (debug.includes('request cookies')) debugPropsInRequest['REQUEST COOKIES'] = options.header.Cookie;
        if (debug.includes('source')) debugPropsInRequest['SOURCE'] = [source, apikey];
        if (debug.includes('body')) debugPropsInRequest['BODY'] = body;
        if (debug.includes('curl')) debugPropsInRequest['CURL'] =  curlWithTrash
        if (debug.includes('curl cleared')) debugPropsInRequest['CURLcleared'] = curlWithoutTrash;
        if (Object.entries(debugPropsInRequest).length > 0) console.info('DEBUG ' + (iteration ? iteration[0] + '/' + iteration[1] : '') + ':', debugPropsInRequest);

        if (dryrun) {
            console.error('DRY RUN');
            resolve(false);
            return;
        };

        // one send attempt -> {err, resp}
        const sendOnce = () => new Promise((res) => pm.sendRequest(options, (err, resp) => res({ err, resp })));

        (async () => {
            // retry transient failures (network error or retryOn status) with exponential backoff
            let attempt = 0, err, resp;
            while (true) {
                ({ err, resp } = await sendOnce());
                let code = resp && resp.code;
                let retryable = !!err || (code && retryOn.includes(code));
                if (retryable && attempt < retries) {
                    attempt++;
                    let delay = Math.min(8000, 500 * Math.pow(2, attempt - 1));  // 500, 1000, 2000, ...
                    console.warn(`request retry ${attempt}/${retries} in ${delay}ms (${err ? 'network error' : 'HTTP ' + code}) ${options.url}`);
                    await new Promise(r => setTimeout(r, delay));
                    continue;
                }
                break;
            }

            if (err) {
                console.error('Error ' + (resp && resp.code ? resp.code : '') + ': ' + (JSON.stringify(err) || ''));
                output.response = err;
                resolve(output.response);
                return;
            }

            let textResponse = resp.text();
            if (resp.headers.get('content-type')?.match(/html/) || textResponse?.match(/DOCTYPE html/) || textResponse?.match(/xml version/) || responseFormat == 'text') {
                if (resp && resp.code && ![200, 201, 202].includes(resp.code)) { resolve(resp.code); return; }
                resolve(textResponse);
                return;
            }

            output.response = resp.json();
            if (![200, 201, 202].includes(resp.code) || (output.response.errors && output.response.errors.length > 0) || output.response.status == false) {
                console.error('ERROR ' + resp.code + ': ' + (JSON.stringify(output.response.errors) || '') + (JSON.stringify(output.response.messages) || ''));
                if (encapsulated && (typeof encapsulated == 'string' || typeof encapsulated == 'number')) {
                    output.response = output.response[encapsulated];
                }
                resolve(output.response);  // error response returned un-processed (matches prior behavior)
                return;
            }
            if (encapsulated && (typeof encapsulated == 'string' || typeof encapsulated == 'number')) {
                output.response = output.response[encapsulated];
            }
            output.response = processData(output.response);
            if (storage) output.response = storage.concat(output.response);

            let debugPropsInResponse = {};
            if (debug.includes('response')) debugPropsInResponse['RESPONSE'] = output.response;
            if (debug.includes('response headers')) debugPropsInResponse['RESPONSE HEADERS'] = resp.headers;
            if (Object.entries(debugPropsInResponse).length > 0) console.info('DEBUG ' + (iteration ? iteration[0] + '/' + iteration[1] : '') + ':', debugPropsInResponse);

            if (getheaders) { resolve(resp.headers); return; }
            resolve(output.response);
        })();
    });
    } catch(e) { console.error(e.trace) }
};

async function* repeat_for({ count = 10, ...params } = {}) {
    let current = 0;
    while (current < count) {
        current++;
        console.log('repeat_for', count, current, params)
        yield request(params);
    }
}
const wait_for = repeat_for;

async function* repeat({ next=null, ...params } = {}) {
    console.log('repeat', next, params)
    while (next) {
        yield request(params);
    }
}
/**
 * A safer async iterator with an intelligent default iterator.
 * The default 'iter' function handles page increments in a JSON body,
 * or for query strings like ?page=1 and ?page[number]=1.
 *
 * @param {object} options
 * @param {number} [options.count=10] - The maximum number of iterations.
 * @param {Function} [options.until=() => false] - A function that receives the last response and returns true to stop.
 * @param {Function} [options.iter] - A function to modify params for the next request. Defaults to a multi-method page incrementer.
 * @param {Function} [options.before=(params) => params] - A function to modify params before the first request.
 * @param {object} options.params - The parameters for the initial request (e.g., url, method, body).
 */
async function* repeat_until({
    count = 999,
    before = (params) => {
        return params;
    },    
    until = (response) => false,
    iter = (params, response) => {
        // 1. Check for 'page' in a JSON body (payload)
        if (params.body) {
            try {
                // Safely create a copy to avoid mutating the original object
                const payload = (typeof params.body === 'string') ? JSON.parse(params.body) : { ...params.body };
                if (payload && typeof payload.page === 'number') {
                    payload.page++;
                    return { ...params, body: JSON.stringify(payload) };
                }
            } catch (e) {
                // Body isn't valid JSON, proceed to check the URL.
            }
        }

        // 2. Check for 'page' in the URL query string
        try {
            const url = new URL(params.url);
            const nestedKey = 'page[number]';
            if (url.searchParams.has(nestedKey)) {
                const currentPage = parseInt(url.searchParams.get(nestedKey) || '1', 10);
                url.searchParams.set(nestedKey, currentPage + 1);
                return { ...params, url: url.toString() };
            }

            const simpleKey = 'page';
            if (url.searchParams.has(simpleKey)) {
                const currentPage = parseInt(url.searchParams.get(simpleKey) || '1', 10);
                url.searchParams.set(simpleKey, currentPage + 1);
                return { ...params, url: url.toString() };
            }
        } catch (e) {
            console.error("Default 'iter' failed: Could not parse URL.", e);
            return params;
        }
        
        console.warn("Default 'iter' could not find a 'page' parameter to increment.");
        return params;
    },
    ...initialParams
} = {}) {
    try {
        const checkForError = (response) => {
            return response?.status === 'false' || response?.code !== 200
        }        
        let currentParams = { ...initialParams };
        currentParams = await Promise.resolve(before(currentParams));

        for (let i = 0; i < count; i++) {
            //console.log(`[DEBUG] 🚀 Iteration #${i + 1}: Making request with params:`, currentParams);
            const response = await request(currentParams);            
            //console.log(`[DEBUG] ✅ Response received.`);
            yield response;
            const isError = await Promise.resolve(checkForError(response))
            const shouldStop = await Promise.resolve(until(response));
            //console.log(`[DEBUG] 🛑 Should stop? until() returned: ${shouldStop}`);
            if (isError || shouldStop) {
                //console.log('[DEBUG] 🚪 Stopping condition met. Exiting loop.');
                return;
            }

            if (i < count - 1) {
                currentParams = await Promise.resolve(iter(currentParams, response));
            }
        }
    } catch (e) {
        console.error(e.stack);
    }
}

async function* debounce({ rate = 100, func, count=500 } = {}) {
    let timeout;
    return (...args) => new Promise(resolve => {
        if (timeout) {
            clearTimeout(timeout);
        }
        timeout = setTimeout(() => resolve(func(...args)), rate);
    });
};

async function* ratelimit(func, rate, async) {
    var queue = [];
    var timeOutRef = false;
    var currentlyEmptyingQueue = false;

    var emptyQueue = function () {
        if (queue.length) {
            currentlyEmptyingQueue = true;
            _.delay(function () {
                if (async) {
                    _.defer(function () { queue.shift().call(); });
                } else {
                    queue.shift().call();
                }
                emptyQueue();
            }, rate);
        } else {
            currentlyEmptyingQueue = false;
        }
    };

    return function () {
        var args = _.map(arguments, function (e) { return e; }); // get arguments into an array
        queue.push(_.bind.apply(this, [func, this].concat(args))); // call apply so that we can pass in arguments as parameters as opposed to an array
        if (!currentlyEmptyingQueue) { emptyQueue(); }
    };
};

/**
 * Groups and processes data by specified criteries and options.
 * @param {Object} options - Configuration object
 * @param {string} [options.name] - Name for grouping
 * @param {Array|Object} options.data - Data to group
 * @param {string} options.criteries - Grouping criteries (slash-separated)
 * @param {string} [options.format='full'] - Output format: 'full', 'csv', 'array'
 * @param {boolean} [options.processEntries=true] - Whether to process entries
 * @param {boolean} [options.silent=false] - Suppress logs
 * @param {string} [options.get=''] - Comma-separated fields to extract
 * @param {boolean} [options.deduplicate=false] - Remove duplicates
 * @param {string} [options.order=null] - Order by field
 * @param {string} [options.sort=null] - Sort by field (alias for order)
 * @param {string} [options.entity=null] - Entity type (unused)
 * @returns {Object|Array|string} Grouped data
 */
function group({
    name = null,
    data,
    criteries,
    format = 'csv',
    processEntries = true,
    silent = false,
    get = '',
    deduplicate = false,
    order = null,
    sort = null,
    entity = null,
    limit = null
} = {}) {
    try {
        if (!data) data = response;

        const KEY_SPLITTER = '/';
        // --- Helper functions ---
        const parseGet = (get) =>
            (get && get.length > 0) ? get.split(',').map(g => g.trim()).filter(g => g !== '') : [];

        const toReadableDuration = (seconds) => {
            let sign = seconds >= 0 ? '' : '-';
            seconds = Math.abs(seconds)
            const days = Math.floor(seconds / 86400);
            let remainingSeconds = seconds % 86400;
            const hours = Math.floor(remainingSeconds / 3600);
            remainingSeconds %= 3600;
            const minutes = Math.floor(remainingSeconds / 60);
            const parts = [];
            if (days > 0) {
                parts.push(`${days}d`);
            }
            if (hours > 0) {
                parts.push(`${hours}h`);
            }
            if (minutes >= 0) {
                parts.push(`${minutes}m`);
            }
            return parts.length > 0 ? `${sign}${parts.join(' ')}` : "-";
        }

        const parseOrder = (order, sort, get) => {
            let ord = order || sort;
            if (!ord) return null;
            ord = ord.split(',').map(g => g.trim()).filter(g => g !== '');
            ord[0] = get && get.indexOf(ord[0]) >= 0 ? get.indexOf(ord[0]) : 0;
            ord[1] = ord[1] === 'asc' ? 'asc' : 'desc';
            return ord;
        };

        const processEntry = (entry, name = '') => {
            if (!processEntries || entry === null || entry === undefined) return entry;
            if (Array.isArray(entry)) {
                return entry.map((e, i) => processEntry(e, i));
            } else if (typeof entry === 'object' && !Array.isArray(entry)) {
                return Object.fromEntries(
                    Object.entries(entry).map(([k, e]) => [k, processEntry(e, k)])
                );
            } else if (typeof entry === 'string' || typeof entry === 'number') {
                let backup = entry;
                try {
                    if (entry.toString()?.match(/{"/)) {
                        entry = JSON.parse(entry);
                        processEntry(entry, name);
                    }
                    const orderLastStatuses = {
                        0: 'new', 1: 'inbound', 2: 'sorted', 3: 'loaded', 4: 'missing',
                        5: 'damaged', 6: 'loaded_manually', 7: 'routed', 8: 'unrouted',
                        9: 'sorted_by_route', 10: 'started', 11: 'failed', 12: 'skipped',
                        13: 'done', 15: 'scheduled', 14: 'cancelled'
                    };
                    if (name && name.toString()?.match('measured_id')) entry = entry.toString();
                    if (name && name.toString()?.match('duration')) entry = toReadableDuration(entry);
                    if (name && name.toString()?.match('last_status') && entry.toString()?.match(/^\d{2}$/)) entry = `${entry} (${orderLastStatuses[entry]})`;
                    //if (name && name.toString()?.match('(timestamp|ts|created|edited|updated|deleted|started)') && entry.toString()?.match(/^\d{10}$/)) entry = `${entry} (${moment(entry * 1000).subtract(moment().parseZone().utcOffset(), 'minutes').format("MM-DD-YYYY HH:mm:ss [GMT+0]")}) ${moment(entry * 1000).fromNow()}`;
                    //if (name && name.toString()?.match('(timestamp|ts|created|edited|updated|deleted|started)') && entry.toString()?.match(/^\d{13}$/)) entry = `${entry} (${moment(entry).subtract(moment().parseZone().utcOffset(), 'minutes').format("MM-DD-YYYY HH:mm:ss [GMT+0]")}) ${moment(entry).fromNow()}`;
                    let timezoneOffset = moment().parseZone().utcOffset();
                    if (name && name.toString()?.match('(timestamp|ts|created|edited|updated|deleted|started)') && entry.toString()?.match(/^\d{10}$/)) entry = `${entry} (${moment(entry*1000).format("MM-DD-YYYY HH:mm:ss [GMT+0]")}) ${moment(entry*1000).from(now()*1000)}`;
                    if (name && name.toString()?.match('(timestamp|ts|created|edited|updated|deleted|started)') && entry.toString()?.match(/^\d{13}$/)) entry = `${entry} (${moment(entry).format("MM-DD-YYYY HH:mm:ss [GMT+0]")}) ${moment(entry).from(now())}`;
                    //console.log(moment().format("MM-DD-YYYY HH:mm:ss [GMT+0]"))
                } catch (e) {
                    console.error('ERROR', e.stack);
                    entry = backup;
                }
                return entry;
            }
            return entry;
        };

        const getValue = ({ data, key } = {}) => {
            if (data === null || data === undefined) return null;
            let keys = key ? key.split(KEY_SPLITTER).filter(k => k !== '') : Object.keys(data);
            const deeper = (data, ks) => {
                if (data !== undefined && ks && ks.length === 1) {
                    if (Array.isArray(data)) {
                        return data.map(e => e[ks[0]]);
                    } else if (typeof data === 'object' && !Array.isArray(data) && data !== null) {
                        return data[ks[0]];
                    } else {
                        return null;
                    }
                } else if (ks && ks.length > 1) {
                    let [first, ...rest] = ks;
                    if (Array.isArray(data)) {
                        return data.map(e => deeper(e[first], rest));
                    } else if (typeof data === 'object' && !Array.isArray(data) && data !== null) {
                        return deeper(data[first], rest);
                    } else {
                        return null;
                    }
                } else {
                    return null;
                }
            };
            return deeper(data, keys);
        };

        const inCollection = (collection, crits, accumulator, parent) => {
            let critsShifted = [...crits];
            critsShifted.shift();
            if (crits.length > 0 && Array.isArray(collection)) {
                collection.forEach(el => inCollection(el, crits, accumulator, parent));
            } else if (crits.length > 0 && typeof collection === 'object' && !Array.isArray(collection) && collection[crits[0]] !== undefined) {
                let entry = collection[crits[0]];
                if (crits.length > 1 && typeof entry === 'object' && entry !== null) {
                    inCollection(entry, critsShifted, accumulator, parent);
                } else {
                    let val = collection[crits[0]];
                    if (typeof val !== 'string') val = JSON.stringify(val);
                    accumulator[val] = accumulator[val] || [];
                    if (getFields.length > 0) {
                        let getAccum = getFields.map(g => JSON.stringify(getValue({ data: parent, key: g })));
                        accumulator[val].push(getAccum);
                    } else accumulator[val].push(parent);
                }
            } else if (crits.length > 0) {
                let val = collection;
                if (typeof val !== 'string') val = JSON.stringify(val);
                accumulator[val] = accumulator[val] || [];
                if (format === 'full') {
                    if (getFields.length > 0) {
                        let getValueArr = getFields.map(g => parent[g] !== undefined ? JSON.stringify(parent[g]) : '');
                        accumulator[val].push(getValueArr.join(', '));
                    } else accumulator[val].push(parent);
                }
            } else {
                if (format === 'full') trash.push(parent);
                return;
            }
            return accumulator;
        };

        // --- Main logic ---
        let trash = [];
        let output = {};
        const getFields = parseGet(get);
        const orderArr = parseOrder(order, sort, getFields);
        if (!criteries) criteries = getFields[0];
        if (!name) name = criteries;
        let criteriesArr = criteries?.split(KEY_SPLITTER) || [getFields[0]];
        let criteriesValue = criteriesArr[criteriesArr.length - 1];

        if (typeof data === 'object' && !Array.isArray(data) && data !== null) {
            data = Object.values(data);
        }
        if (!data || data?.length === 0) return {};

        data = processEntry(data);

        output = data.reduce((result, current) => inCollection(current, criteriesArr, result, current), {});
        let csv_data = '';
        let outputEntries = Object.entries(output);
        if (deduplicate) outputEntries = outputEntries.filter(e => e.length > 1);
        if (limit && limit > 0) outputEntries = outputEntries.slice(0, limit);

        if (format === 'array' || format === 'csv') {
            outputEntries = outputEntries.flatMap(e => e[1]);

            if (orderArr) {
                outputEntries.sort((a, b) => {
                    if (orderArr[0] in a && orderArr[0] in b && a[orderArr[0]] && b[orderArr[0]]) return a[orderArr[0]].localeCompare(b[orderArr[0]]);
                    else return 0;
                });
                
                if (orderArr[1] === 'desc') outputEntries.reverse();
            }
            if (getFields.length > 0) {
                csv_data = csv({ data: outputEntries, headers: getFields });
            } else if (Array.isArray(outputEntries) && typeof outputEntries[0] === 'object') {
                csv_data = csv({ data: outputEntries, headers: Object.keys(outputEntries[0]) });
            } else if (outputEntries && typeof outputEntries === 'object' && !Array.isArray(outputEntries)) {
                csv_data = csv({ data: outputEntries, headers: Object.keys(outputEntries) });
            }
            if (getFields.length > 0 && !silent) {
                outputEntries = outputEntries.map(e => Array.isArray(e) ? e.join(', ') : e);
                outputEntries.unshift(getFields.join(', '));
            }
            output = outputEntries;
            
        } else {
            if (orderArr) {
                outputEntries.sort((a, b) => {
                    if (((typeof a === 'string') || (typeof a === 'number')) && ((typeof b === 'string') || (typeof b === 'number'))) return a.localeCompare(b);
                    else return 0;
                });
                if (orderArr[1] === 'desc') outputEntries.reverse();
            }
            if (getFields.length > 0 && !silent) {
                outputEntries = outputEntries.map(e => {
                    e[1] = e[1].map(e1 => Array.isArray(e1) ? e1.join(', ') : e1);
                    return e;
                });
                outputEntries[0][1].unshift(getFields.join(', '));
            }
            output = Object.fromEntries(outputEntries);
        }

        let log = format === 'csv' ? csv_data : output;
        if (!silent) {
            console.info(
                'grouped by:' + name,
                'was: ' + data.length,
                'is: ' + (!getFields.length ? Object.keys(output).length : (Object.keys(output).length - 1)),
                '\n',
                log
            );
        }
        return output;
    } catch (e) {
        console.error('ERROR:', e.stack);
    }
}

// SQL-like fluent query builder over an array of objects (lodash-backed).
// Pipeline order mirrors SQL: where -> groupBy -> select -> having -> distinct -> orderBy -> offset/limit.
// Accepts: array | helper output {list} | RAW API response ({items} / {data:{items}} / results / ...)
//          | object map of rows. Warns on anything else.
//
//   from(routes.list)
//     .where(r => r.is_depot === 'No')      // fn, or {field: value | {op:val}} condition
//     .group('route_status')                // string / [strings] / fn   (alias: groupBy)
//     .select({ n: '*count', avg_dist: 'avg:distance' })
//     .having(g => g.n > 1)
//     .order('n', 'desc')                   // alias: orderBy
//     .limit(10)
//     .all();                               // terminal: returns rows (ALSO prints to console by default)
//
// Terminals (.all/.first/.count/.pluck/.csv/.json/.keyBy/.toGroups/.stats/.to/.log) auto-print
// their result. Suppress per-query with .silent() (or .log(false)); toggle globally via
// setFromAutolog(false) / FROM_AUTOLOG. .loud(label) forces printing with a custom label.
//
// Aggregate specs (select values): '*count' | 'count' | 'sum:field' | 'avg:field' |
//   'min:field' | 'max:field' | 'first:field' | 'last:field' | 'distinct:field' |
//   'countDistinct:field' | 'field' (representative value) | (rows, key) => any
// Without groupBy: a select containing aggregates collapses to ONE summary row;
// a select of only plain fields/fns projects each row.
//
// Value enrichment (humanize duration/last_status/timestamps/measured_id) is ON BY DEFAULT and
// applied to FINAL output rows only — filtering/grouping/aggregation always run on raw values.
// Note: matched fields come back as display STRINGS. For math, re-querying, or raw extraction,
// call .raw() on the query, or flip ENRICH_BY_DEFAULT below.
let ENRICH_BY_DEFAULT = true;
// Terminals print their result to the console by default. Flip this off globally, or per-query
// with .silent() (suppress) / .loud(label). setFromAutolog(false) toggles it at runtime.
let FROM_AUTOLOG = true;
const setFromAutolog = (on) => { FROM_AUTOLOG = !!on; };
// Timezone for enriched timestamp display. 'local' (default, machine zone) | 'utc' | a fixed offset
// (minutes number or '+HH:mm' string). Set globally with setTimezone('utc'), or per-query via from().tz(...).
let ENRICH_TZ = 'local';
const setTimezone = (tz) => { ENRICH_TZ = (tz == null || tz === '') ? 'local' : tz; return ENRICH_TZ; };

const from = (data) => {
    // Accepted inputs (in detection order):
    //   1. array of rows
    //   2. helper output { list, total?, by_* }
    //   3. RAW API response — response.items / response.data.items (and the other envelope
    //      variants pickItems knows); server total picked up via pickTotal for stats()
    //   4. object map of rows (e.g. by_id) -> Object.values
    // Anything else (null/primitive/empty envelope) warns and yields an empty set.
    let rows, sourceTotal = null;
    if (Array.isArray(data)) rows = data;
    else if (data && Array.isArray(data.list)) { rows = data.list; sourceTotal = data.total ?? data.total_items ?? data.total_items_count ?? null; }
    else if (data && typeof data === 'object') {
        let extracted = pickItems(data);   // raw response support: items / data.items / results / ...
        if (Array.isArray(extracted)) {
            rows = extracted;
            sourceTotal = pickTotal(data);
        } else {
            rows = Object.values(data);    // object map of rows (by_id-style)
            if (!rows.length) console.warn('from(): object supplied but no rows found — expected items/data.items array, helper output {list}, or a non-empty object map');
            else if (rows.every(v => v === null || typeof v !== 'object')) console.warn('from(): object map values are not objects (array of objects expected) — did you mean to pass response.data.items?');
        }
    }
    else {
        rows = [];
        console.warn('from(): unsupported data — expected array of objects, helper output {list}, raw response {items|data.items}, or object map; got ' + (data === null ? 'null' : typeof data));
    }

    // path resolver: lodash _.get first; if that misses AND the path crosses an ARRAY, map over the
    // items — so 'groups.key' on groups:[{key},...] returns ['Undefined','Acme',...] (works at any depth).
    const get = (row, field) => {
        let v = _.get(row, field);
        if (v !== undefined) return v;
        const walk = (val, segs) => {
            if (!segs.length) return val;
            if (val == null) return undefined;
            if (Array.isArray(val)) {
                let mapped = val.map(x => walk(x, segs)).filter(x => x !== undefined);
                return mapped.length ? mapped : undefined;
            }
            return walk(val[segs[0]], segs.slice(1));
        };
        return walk(row, String(field).split('.').filter(Boolean));
    };

    // --- value enrichment (humanize raw values by field name), opt-in via .enrich() ---
    const enrichDuration = (seconds) => {
        let sign = seconds >= 0 ? '' : '-';
        seconds = Math.abs(seconds);
        const days = Math.floor(seconds / 86400);
        let rem = seconds % 86400;
        const hours = Math.floor(rem / 3600);
        rem %= 3600;
        const minutes = Math.floor(rem / 60);
        const parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes >= 0) parts.push(`${minutes}m`);
        return parts.length > 0 ? `${sign}${parts.join(' ')}` : '-';
    };

    const ORDER_LAST_STATUSES = {
        0: 'new', 1: 'inbound', 2: 'sorted', 3: 'loaded', 4: 'missing',
        5: 'damaged', 6: 'loaded_manually', 7: 'routed', 8: 'unrouted',
        9: 'sorted_by_route', 10: 'started', 11: 'failed', 12: 'skipped',
        13: 'done', 15: 'scheduled', 14: 'cancelled'
    };

    // Plausible-timestamp window for VALUE-based detection: 2010-01-01 .. 2040-01-01 (unix seconds).
    // 10/13-digit numbers outside this window (e.g. big sequential ids) are left untouched.
    const TS_MIN = 1262304000, TS_MAX = 2208988800;
    // Readable time in the configured zone: per-query .tz(...) overrides the global setTimezone().
    // 'local' (machine zone) | 'utc' | fixed offset (minutes or '+HH:mm'). ZZ prints the actual offset.
    const tsReadable = (raw, ms) => {
        let z = state.tz != null ? state.tz : ENRICH_TZ;
        let m;
        if (z === 'utc' || z === 'UTC') m = moment.utc(ms);
        else if (z === 'local' || z == null) m = moment(ms);
        else { m = moment(ms); try { m.utcOffset(z); } catch (e) {} }   // fixed offset
        return `${raw} (${m.format("ddd MMM DD YYYY HH:mm:ss [GMT]ZZ")})`;
    };

    // Transform a single scalar value based on its field name — plus value-based timestamp
    // detection on ANY field: 1781202772 / 1781202772000 within the window become readable time.
    const enrichValue = (entry, name) => {
        if (entry === null || entry === undefined) return entry;
        if (typeof entry !== 'string' && typeof entry !== 'number') return entry;
        let backup = entry;
        try {
            name = name != null ? name.toString() : '';
            if (name.match('measured_id')) entry = entry.toString();
            if (name.match('duration')) entry = enrichDuration(entry);
            if (name.match('last_status') && entry.toString().match(/^\d{1,2}$/)) entry = `${entry} (${ORDER_LAST_STATUSES[entry]})`;
            if (name.match('(timestamp|ts|created|edited|updated|deleted|started)') && entry.toString().match(/^\d{10}$/)) entry = tsReadable(backup, entry * 1000);
            if (name.match('(timestamp|ts|created|edited|updated|deleted|started)') && entry.toString().match(/^\d{13}$/)) entry = tsReadable(backup, +entry);

            // value-based fallback: untouched so far, looks like unix seconds/ms in the window
            if (entry === backup) {
                let s = String(entry), n = Number(entry);
                if (/^\d{10}$/.test(s) && n >= TS_MIN && n <= TS_MAX) entry = tsReadable(backup, n * 1000);
                else if (/^\d{13}$/.test(s) && n >= TS_MIN * 1000 && n <= TS_MAX * 1000) entry = tsReadable(backup, n);
            }
        } catch (e) {
            entry = backup;
        }
        return entry;
    };

    // Deep-enrich: recurse objects (by key) and arrays (carrying the parent field name).
    // Returns new structures, never mutates the source rows.
    const enrichEntry = (entry, name = '') => {
        if (entry === null || entry === undefined) return entry;
        if (Array.isArray(entry)) return entry.map(e => enrichEntry(e, name));
        if (typeof entry === 'object') return Object.fromEntries(Object.entries(entry).map(([k, e]) => [k, enrichEntry(e, k)]));
        return enrichValue(entry, name);
    };

    const parseAgg = (spec) => {
        if (typeof spec === 'function') return { fn: 'custom', custom: spec };
        let s = String(spec);
        if (s === '*' || s === '*count' || s === 'count') return { fn: 'count' };
        let m = s.match(/^(\w+)\s*:\s*(.+)$/);
        if (m) return { fn: m[1], field: m[2].trim() };
        return { fn: 'field', field: s };
    };

    const isAggSpec = (spec) => {
        if (typeof spec === 'function') return false;
        let a = parseAgg(spec);
        return a.fn !== 'field';
    };

    const applyAgg = (a, groupRows, key) => {
        switch (a.fn) {
            case 'count': return groupRows.length;
            case 'sum': return _.sumBy(groupRows, r => Number(get(r, a.field)) || 0);
            case 'avg': return groupRows.length ? _.meanBy(groupRows, r => Number(get(r, a.field)) || 0) : null;
            case 'min': return _.min(groupRows.map(r => get(r, a.field)));
            case 'max': return _.max(groupRows.map(r => get(r, a.field)));
            case 'first': return get(groupRows[0], a.field);
            case 'last': return get(groupRows[groupRows.length - 1], a.field);
            case 'distinct': return _.uniq(groupRows.map(r => get(r, a.field)));
            case 'countDistinct': return _.uniq(groupRows.map(r => get(r, a.field))).length;
            case 'field': return get(groupRows[0], a.field);
            case 'custom': return a.custom(groupRows, key);
            default: return null;
        }
    };

    // Query state
    const state = {
        rows: rows,
        wheres: [],
        lookups: [],       // [{leftKey, as, pick, fn}] — joins applied after WHERE
        extends: [],       // [{col: fn|'field'}] — computed columns, applied after lookups
        unnests: [],       // array paths to explode into one row per item (also auto-detected from select)
        tz: null,          // per-query timezone override for enriched timestamps ('utc'|'local'|offset)
        groupKeys: null,   // null | [string] | fn
        selectSpec: null,
        havingFn: null,
        distinct: false,
        orders: [],        // [{field, dir}]
        limitN: null,
        offsetN: 0,
        enrich: ENRICH_BY_DEFAULT,
        enrichOnly: null,  // null = all fields | [name patterns] = only these columns
        log: FROM_AUTOLOG, // terminals print their result unless suppressed
        logLabel: 'from',
        sourceTotal: sourceTotal   // server total of the source (total/total_items/total_items_count), if known
    };

    // Print a terminal's result (unless suppressed), then return it unchanged.
    // Header shows "<result entries> of <source entries>" (filtered/grouped vs supplied);
    // appends the server total when the source carried one that differs.
    const emit = (value, resultCount = null) => {
        if (state.log) {
            let n = resultCount;
            if (n == null) {
                if (Array.isArray(value)) n = value.length;
                else if (value && typeof value === 'object') n = Object.keys(value).length;
            }
            let header = `${state.logLabel} (${n != null ? n : '?'} of ${state.rows.length} entries`
                + (state.sourceTotal != null && state.sourceTotal !== state.rows.length ? `, server total ${state.sourceTotal}` : '')
                + ')';
            if (Array.isArray(value) && value.length && typeof value[0] === 'object' && typeof console.table === 'function') {
                console.info(header);
                console.table(value);
            } else {
                console.info(header, value);
            }
        }
        return value;
    };

    const normalizeKey = (row) => {
        if (typeof state.groupKeys === 'function') return state.groupKeys(row);
        return state.groupKeys.map(k => get(row, k));
    };

    // Build a predicate from an object condition. Values can be scalars (eq), arrays (in),
    // or operator objects: {gt,gte,lt,lte,eq,ne,in,nin,like,regex,exists}.
    const objPredicate = (cond) => {
        let checks = Object.entries(cond).map(([k, v]) => {
            if (Array.isArray(v)) return (row) => v.includes(get(row, k));
            if (v && typeof v === 'object') {
                let ops = Object.entries(v);
                return (row) => {
                    let x = get(row, k);
                    return ops.every(([op, val]) => {
                        switch (op) {
                            case 'gt': return x > val;
                            case 'gte': return x >= val;
                            case 'lt': return x < val;
                            case 'lte': return x <= val;
                            case 'eq': return x === val;
                            case 'ne': return x !== val;
                            case 'in': return Array.isArray(val) && val.includes(x);
                            case 'nin': return Array.isArray(val) && !val.includes(x);
                            case 'like': return String(x ?? '').toLowerCase().includes(String(val).toLowerCase());
                            case 'regex': return new RegExp(val).test(String(x ?? ''));
                            case 'exists': return val ? (x != null) : (x == null);
                            default: return true;
                        }
                    });
                };
            }
            return (row) => get(row, k) === v;
        });
        return (row) => checks.every(c => c(row));
    };

    // Explode rows on the given array paths (one row per item; the field becomes the single item).
    const explode = (rows, paths) => {
        let out = rows;
        for (let p of [...new Set(paths)]) {
            out = out.flatMap(r => {
                let arr = _.get(r, p);
                if (!Array.isArray(arr)) return [r];
                return arr.map(item => { let copy = JSON.parse(JSON.stringify(r)); _.set(copy, p, item); return copy; });
            });
        }
        return out;
    };

    // UNNEST (explicit, SQL-lateral style: first) -> WHERE -> LOOKUP joins -> EXTEND computed columns.
    // Explicit .unnest() runs BEFORE where/lookup so filters and joins see one row per item
    // (e.g. .unnest('groups').lookup({on:'groups.key',...})). Shared by run() and stats().
    const applyWhereLookup = (rows) => {
        let out = state.unnests.length ? explode(rows, state.unnests) : rows;
        for (let w of state.wheres) out = out.filter(w);
        if (state.lookups.length) {
            out = out.map(row => {
                let copy = { ...row };
                for (let lk of state.lookups) {
                    let matched = lk.fn(get(row, lk.leftKey));
                    copy[lk.as] = matched != null ? (lk.pick ? get(matched, lk.pick) : matched) : null;
                }
                return copy;
            });
        }
        if (state.extends.length) {
            out = out.map(row => {
                let copy = (row && typeof row === 'object') ? { ...row } : row;
                for (let ex of state.extends) for (let [col, spec] of Object.entries(ex)) {
                    copy[col] = typeof spec === 'function' ? spec(copy) : get(copy, String(spec));
                }
                return copy;
            });
        }
        return out;
    };

    const run = () => {
        let out = applyWhereLookup(state.rows);

        // AUTO-UNNEST — string select paths that cross an array explode into one row per item
        // (select('groups.key') -> one row per group). Explicit .unnest() already ran in applyWhereLookup.
        if (state.selectSpec && out.length) {
            let auto = [];
            let sample = out.find(r => r && typeof r === 'object');
            if (sample) for (let sp of Object.values(state.selectSpec)) {
                if (typeof sp !== 'string' || isAggSpec(sp)) continue;
                let segs = String(sp).split('.'), prefix = [];
                for (let s of segs.slice(0, -1)) {          // never unnest on the leaf segment itself
                    prefix.push(s);
                    let v = _.get(sample, prefix.join('.'));
                    if (Array.isArray(v)) { auto.push(prefix.join('.')); break; }
                    if (v === undefined) break;
                }
            }
            if (auto.length) out = explode(out, auto);
        }

        // GROUP BY + SELECT
        if (state.groupKeys) {
            let groups = new Map();
            for (let row of out) {
                let keyVals = normalizeKey(row);
                let mapKey = JSON.stringify(keyVals);
                if (!groups.has(mapKey)) groups.set(mapKey, { keyVals, rows: [] });
                groups.get(mapKey).rows.push(row);
            }

            let keyNames = typeof state.groupKeys === 'function'
                ? ['_group']
                : state.groupKeys.slice();

            let spec = state.selectSpec || { count: '*count' };

            out = [...groups.values()].map(({ keyVals, rows: grp }) => {
                let resultRow = {};
                // group-key columns
                if (typeof state.groupKeys === 'function') resultRow._group = keyVals;
                else keyNames.forEach((kn, i) => { resultRow[kn] = keyVals[i]; });
                // selected aggregates
                for (let [alias, sp] of Object.entries(spec)) {
                    resultRow[alias] = typeof sp === 'function'
                        ? sp(grp, keyVals)
                        : applyAgg(parseAgg(sp), grp, keyVals);
                }
                return resultRow;
            });

        } else if (state.selectSpec) {
            let entries = Object.entries(state.selectSpec);
            let hasAgg = entries.some(([, sp]) => isAggSpec(sp));
            if (hasAgg) {
                // collapse to a single summary row over all filtered rows
                let resultRow = {};
                for (let [alias, sp] of entries) {
                    resultRow[alias] = typeof sp === 'function'
                        ? sp(out)
                        : applyAgg(parseAgg(sp), out, null);
                }
                out = [resultRow];
            } else {
                // per-row projection
                out = out.map(row => {
                    let resultRow = {};
                    for (let [alias, sp] of entries) {
                        resultRow[alias] = typeof sp === 'function' ? sp(row) : get(row, String(sp));
                    }
                    return resultRow;
                });
                // a selected column that resolved to nothing on EVERY row is almost always a path typo
                // (e.g. select('customer.name') after lookup({pick:'name'}) — the column is already the name)
                if (out.length) for (let [alias] of entries) {
                    if (out.every(r => r[alias] === undefined)) console.warn("select: '" + alias + "' matched nothing on all " + out.length + ' rows — check the path (it will be missing from csv output)');
                }
            }
        }

        // HAVING
        if (state.havingFn) out = out.filter(state.havingFn);

        // DISTINCT
        if (state.distinct) out = _.uniqBy(out, r => JSON.stringify(r));

        // ORDER BY
        if (state.orders.length) {
            out = _.orderBy(
                out,
                state.orders.map(o => (typeof o.field === 'function' ? o.field : (r => get(r, o.field)))),
                state.orders.map(o => o.dir)
            );
        }

        // OFFSET / LIMIT
        if (state.offsetN) out = out.slice(state.offsetN);
        if (state.limitN != null) out = out.slice(0, state.limitN);

        // ENRICH (last: humanize output values; never affects filtering/aggregation above)
        if (state.enrich) {
            out = out.map(row => {
                if (row === null || typeof row !== 'object') return enrichValue(row, '');
                if (state.enrichOnly) {
                    let copy = Array.isArray(row) ? [...row] : { ...row };
                    for (let k of Object.keys(copy)) {
                        if (state.enrichOnly.some(p => k === p || k.match(p))) copy[k] = enrichEntry(copy[k], k);
                    }
                    return copy;
                }
                return enrichEntry(row, '');
            });
        }

        return out;
    };

    const api = {
        where(cond) {
            if (typeof cond === 'function') state.wheres.push(cond);
            else if (cond && typeof cond === 'object') state.wheres.push(objPredicate(cond));
            return api;
        },
        whereIn(field, values) {
            let set = new Set(values);
            state.wheres.push(row => set.has(get(row, field)));
            return api;
        },
        // Join: enrich each row with a matched record from another dataset.
        //   .lookup({ from, on, as, pick })
        //   from: array (indexed by `on`/on[1]) | object map (keyed by the lookup value) | Map
        //   on: 'field' or [leftField, rightField]; as: new column; pick: optional sub-field of the match
        lookup({ from, on, as, pick } = {}) {
            let leftKey = Array.isArray(on) ? on[0] : on;
            let rightKey = Array.isArray(on) ? on[1] : on;
            let fn;
            if (Array.isArray(from)) { let m = new Map(from.map(x => [get(x, rightKey), x])); fn = (v) => m.get(v); }
            else if (from instanceof Map) { fn = (v) => from.get(v); }
            else if (from && typeof from === 'object') { fn = (v) => from[v]; }
            else fn = () => undefined;
            state.lookups.push({ leftKey, as: as || 'lookup', pick, fn });
            return api;
        },
        // Cross-field case-insensitive search: .search('knoxville') scans all scalar fields;
        // .search('john', 'first_name,email') / ['first_name','email'] restricts the fields.
        search(term, fields = null) {
            if (term == null || term === '') return api;
            let t = String(term).toLowerCase();
            let flds = fields ? (Array.isArray(fields) ? fields : String(fields).split(',').map(s => s.trim()).filter(Boolean)) : null;
            state.wheres.push(row => {
                if (row == null || typeof row !== 'object') return String(row).toLowerCase().includes(t);
                let keys = flds || Object.keys(row);
                return keys.some(k => {
                    let v = get(row, k);
                    return v != null && typeof v !== 'object' && String(v).toLowerCase().includes(t);
                });
            });
            return api;
        },
        // Computed columns WITHOUT dropping the rest of the row (unlike .select projection):
        //   .extend({ km: r => r.distance / 1000, type: 'custom_data.type' })
        // Applied after where/lookup, before group/select/order — so you can group/order on them.
        extend(spec) {
            if (spec && typeof spec === 'object') state.extends.push(spec);
            return api;
        },
        group(keys) {
            state.groupKeys = (typeof keys === 'function' || Array.isArray(keys)) ? keys : [keys];
            return api;
        },
        groupBy(keys) { return api.group(keys); },   // alias
        // Explode rows on an array field: .unnest('groups') -> one row per groups[] item (the field
        // becomes the single item). Happens automatically for string select paths crossing an array.
        unnest(path) { if (path) state.unnests.push(String(path)); return api; },
        select(spec) {
            // 'a,b,c' or ['a','b'] -> identity projection map; object -> spec as-is
            if (typeof spec === 'string') spec = spec.split(',').map(f => f.trim()).filter(Boolean);
            if (Array.isArray(spec)) {
                state.selectSpec = Object.fromEntries(spec.map(f => [f, f]));
            } else {
                state.selectSpec = spec;
            }
            return api;
        },
        having(fn) { state.havingFn = fn; return api; },
        distinct() { state.distinct = true; return api; },
        // Humanize output values by field name (duration -> "5m", last_status -> "10 (started)",
        // timestamps -> "<raw> (date) X ago", measured_id -> string). Applied to final rows only.
        // .enrich() = all fields deep; .enrich(['duration','last_status']) = only matching columns.
        enrich(fields = null) {
            state.enrich = true;
            if (fields) state.enrichOnly = (Array.isArray(fields) ? fields : [fields]);
            return api;
        },
        // Opt out of enrichment (raw values) — useful for math, re-querying, or extraction.
        raw() { state.enrich = false; state.enrichOnly = null; return api; },
        order(field, dir = 'asc') {
            state.orders.push({ field, dir: dir === 'desc' ? 'desc' : 'asc' });
            return api;
        },
        orderBy(field, dir = 'asc') { return api.order(field, dir); },   // alias
        limit(n) { state.limitN = n; return api; },
        offset(n) { state.offsetN = n; return api; },

        // --- console control (chainable) ---
        // Terminals auto-print by default. .silent() suppresses for this query; .loud(label) forces on.
        silent() { state.log = false; return api; },
        // Timezone for enriched timestamps in THIS query: .tz('utc') | .tz('local') | .tz('+03:00') | .tz(180).
        tz(zone) { state.tz = (zone == null || zone === '') ? 'local' : zone; return api; },
        loud(label) { state.log = true; if (label) state.logLabel = label; return api; },

        // --- terminals (return data, end the chain — and print it unless silenced) ---
        all() { return emit(run()); },
        value() { return emit(run()); },
        // .log(arg): convenience terminal. .log('label') prints with a label; .log(false) is silent.
        log(arg = true) {
            if (arg === false) return api.silent().all();
            if (typeof arg === 'string') state.logLabel = arg;
            state.log = true;
            return emit(run());
        },
        first() { let v = run()[0] ?? null; return emit(v, v != null ? 1 : 0); },
        count() { let n = run().length; return emit(n, n); },
        pluck(field) { return emit(run().map(r => get(r, field))); },
        // Per-numeric-column summary over the filtered (post-where/lookup) rows: {col:{count,min,max,avg,sum}}.
        stats() {
            let rows = applyWhereLookup(state.rows);
            let cols = {};
            rows.forEach(r => {
                if (r && typeof r === 'object') for (let [k, v] of Object.entries(r)) {
                    if (typeof v === 'number' && isFinite(v)) (cols[k] = cols[k] || []).push(v);
                }
            });
            let out = {};
            for (let [k, vals] of Object.entries(cols)) out[k] = { count: vals.length, min: _.min(vals), max: _.max(vals), avg: _.mean(vals), sum: _.sum(vals) };
            // total length of the analyzed (post-where/lookup) set, plus the source's server total if known
            if (!('total' in out)) out.total = rows.length;
            if (state.sourceTotal != null && !('total_items_count' in out)) out.total_items_count = state.sourceTotal;
            return emit(out, rows.length);   // header count = analyzed (filtered) rows, not column count
        },
        keyBy(field) { return emit(_.keyBy(run(), r => get(r, field))); },
        toGroups() {
            // raw {keyJSON: rows[]} without aggregation
            let prev = state.selectSpec; state.selectSpec = null;
            let groups = {};
            let base = state.rows;
            for (let w of state.wheres) base = base.filter(w);
            for (let row of base) {
                let k = state.groupKeys ? JSON.stringify(normalizeKey(row)) : 'all';
                (groups[k] = groups[k] || []).push(row);
            }
            state.selectSpec = prev;
            return emit(groups);
        },
        csv() {
            let r = run();
            return emit(csv({ data: r }), r.length);   // csv() derives headers from the UNION of all rows
        },
        // JSON string. .json() = pretty (2-space); .json(0) = compact.
        json(pretty = 2) { let r = run(); return emit(JSON.stringify(r, null, pretty), r.length); },
        // Format dispatcher for when the output format is dynamic (e.g. ?format=csv):
        //   .to('array'|'json'|'csv'|'count'|'first'|'groups'|'stats')  (default 'array')
        //   (delegates to the matching terminal, so it prints once like the rest)
        to(format = 'array') {
            switch (String(format).toLowerCase()) {
                case 'csv': return api.csv();
                case 'json': return api.json();
                case 'count': return api.count();
                case 'first': return api.first();
                case 'groups': return api.toGroups();
                case 'stats': return api.stats();
                case 'array':
                case 'json-array':
                default: return api.all();
            }
        },
        // Render the result as an HTML table in Postman's Visualize tab (post-response scripts only);
        // falls back to console.table elsewhere. Returns the rows.
        visualize(title = null) {
            let r = run();
            try {
                if (typeof pm !== 'undefined' && pm.visualizer && typeof pm.visualizer.set === 'function') {
                    let cols = r.length && typeof r[0] === 'object' ? Object.keys(r[0]) : [];
                    let tpl = `<style>table{border-collapse:collapse;font:12px sans-serif}th,td{border:1px solid #ccc;padding:4px 8px;text-align:left}th{background:#f0f0f0}</style>`
                        + (title ? `<h4>{{title}} ({{rows.length}} rows)</h4>` : `<h4>{{rows.length}} rows</h4>`)
                        + `<table><tr>{{#each cols}}<th>{{this}}</th>{{/each}}</tr>`
                        + `{{#each rows}}<tr>{{#each ../cols}}<td>{{lookup .. this}}</td>{{/each}}</tr>{{/each}}</table>`;
                    pm.visualizer.set(tpl, { rows: r, cols, title });
                } else if (typeof console.table === 'function') console.table(r);
            } catch (e) { console.error('visualize: ' + (e.stack || e)); }
            return r;
        },
        // chainable side-effect: peek at the current rows mid-chain without ending it
        tap(fn) {
            try { if (typeof fn === 'function') fn(run()); } catch (e) { console.error('tap: ' + (e.stack || e)); }
            return api;
        }
    };

    return api;
};

// --- shared env / base-URL primitives ----------------------------------------
// resolveEnv: derive a LOCAL isPROD from an explicit env (falls back to the request's env).
// Returns a boolean — assign it to a local `let isPROD` so helpers never mutate module scope.
const resolveEnv = (env) => env ? env.toUpperCase() === 'PROD' : PROD;
// apiBase: the v5.0 API root for prod/staging. opts.billing -> the /billing-api root; opts.v4 -> the api.v4 root.
const apiBase = (isPROD, { billing = false, v4 = false } = {}) => {
    if (v4) return isPROD ? 'https://api.route4me.com/api.v4' : 'https://api.routeml.com/api.v4';
    let root = isPROD ? 'https://wh.route4me.com/modules/api/v5.0' : 'https://wh-staging-yx2ian2bajaskas.routeml.com/modules/api/v5.0';
    return billing ? root + '/billing-api' : root;
};

// Bearer credential resolver used by every helper: an explicit api_key wins; else query.api_key
// is used as-is; else, if query.member_id is set, mint a service-impersonation token() for that
// member and use its access_token (cached per env+member_id for this run). Returns the bearer
// string or null (a null just lets the request 401 — no more "no api_key" noise).
// Coerce a credential to a bearer string: a token() response object -> its access_token;
// a string passes through. Prevents an accidental object from becoming "Bearer [object Object]".
const asBearer = (v) => (v && typeof v === 'object') ? (v.access_token || v.token || v.accessToken || null) : v;

const _cvStr = (name) => { let c = pm.collectionVariables.get(name); return (typeof c === 'string' && c && c !== '[object Object]') ? c : null; };
// config value: request HEADERS first (any of the given names), else the URL query (first name)
const cfg = (...names) => {
    for (let n of names) { try { let h = pm.request.headers.get(n); if (h != null && h !== '') return h; } catch (e) {} }
    return query[names[0]];
};
// When authenticating with a bare {{token}} (no member_id around), look the member up via
// /profile-api and print who the token belongs to. De-duped per token value per run.
let _announcedFor = null;
const _announceMember = async (bearer, env) => {
    if (!bearer || _announcedFor === bearer) return;
    _announcedFor = bearer;
    try {
        let p = await request({ url: apiBase(resolveEnv(env)) + '/profile-api?', method: 'GET', authtype: 'bearer', apikey: bearer, debug: DEBUG() });
        if (p && p.member_id != null) console.info('{{token}} -> member_id: ' + p.member_id + (p.member_email ? ' (' + p.member_email + ')' : ''));
    } catch (e) {}
};

// ALL auth lives in ONE collection variable: {{token}} — never cleared on request start.
// PROD: auth by api_key OR a manually pre-set {{token}}; member_id NEVER mints a token on prod.
// STAGING: additionally member_id -> token auth (reuse {{token}} or mint via token()).
// api_key auth always validates that {{token}} contains the api_key (fixes it if it differs).
const resolveApiKey = async (api_key, env) => {
    api_key = asBearer(api_key);
    if (api_key) {                                     // explicit arg wins; ensure {{token}} matches
        if (_cvStr('token') !== api_key) pm.collectionVariables.set('token', api_key);
        return api_key;
    }

    let isPROD = resolveEnv(env);
    let member_id = cfg('member_id');
    let key = cfg('api_key', 'X-API-KEY');
    let cached = _cvStr('token');

    if (isPROD) {
        // prod: api_key OR manual {{token}}; ignore member_id (no minting on prod)
        if (key) { if (cached !== key) pm.collectionVariables.set('token', key); return key; }
        if (cached) { if (!member_id) await _announceMember(cached, env); return cached; }
        if (member_id) console.warn('auth: member_id auth on PROD requires {{token}} to be pre-set — token() is not requested on prod');
        return null;
    }

    // staging: member_id -> token auth first (reuse {{token}} or mint)
    if (member_id) {
        let bearer = cached || asBearer(await token({ env: env, member_id: member_id }));
        if (bearer && bearer !== cached) pm.collectionVariables.set('token', bearer);
        return bearer || null;
    }
    if (key) { if (cached !== key) pm.collectionVariables.set('token', key); return key; }
    if (cached) { await _announceMember(cached, env); return cached; }   // bare token -> report member_id
    return null;
};

// v4 endpoints: use Bearer with the single {{token}} (falls back to the passed key if the var is empty).
const v4auth = (api_key) => {
    let tok = _cvStr('token') || api_key;
    return tok ? { authtype: 'bearer', apikey: tok } : { authtype: 'apikey', apikey: api_key };
};

// --- account-level facility selection ---------------------------------------
// Some list endpoints scope their results to the account's "selected facilities".
// select_facilities() sets that selection ([] = all facilities). It's auto-invoked
// before any list helper (via fetch_combined) so lists return proper results.
let FACILITY_IDS = [];                    // facilities to select before list calls ([] = all)
let SELECT_FACILITIES_ON_LIST = true;     // set false to disable the auto-selection
let _facilitiesSelectedKey = null;        // de-dup guard (per script run)
let _facilitiesSelectedExternally = false; // set when select_facilities() is called directly -> suppress auto-call

const _facilitiesBase = (prod) => apiBase(prod);
const _facilityKey = (api_key, base, ids) => api_key + '|' + base + '|' + JSON.stringify(ids);

// Standalone helper: POST /account/settings/facilities/select with a facility_ids list.
// Calling this directly suppresses the internal auto-call (you've taken control of the selection).
const select_facilities = async ({ api_key=null, env=null, facility_ids=null } = {}) => {
    let isPROD = resolveEnv(env);
    api_key = await resolveApiKey(api_key, env);

    let ids = facility_ids != null ? facility_ids : FACILITY_IDS;
    ids = Array.isArray(ids) ? ids : String(ids).split(',').map(i => i.trim()).filter(i => i);
    FACILITY_IDS = ids;
    _facilitiesSelectedExternally = true;  // from now on, fetch_combined won't auto-select

    let base = _facilitiesBase(isPROD);
    return await request({
        url: base + '/account/settings/facilities/select?',
        method: 'POST',
        authtype: 'bearer',
        apikey: api_key,
        debug: DEBUG(),
        body: { facility_ids: ids }
    });
};

// internal: ensure the selection has been applied once per (api_key + base + ids) signature
const ensure_facilities_selected = async (api_key, base) => {
    if (!SELECT_FACILITIES_ON_LIST || !base) return;
    if (_facilitiesSelectedExternally) return;  // user called select_facilities() -> don't override
    let ids = Array.isArray(FACILITY_IDS) ? FACILITY_IDS : [];
    let key = _facilityKey(api_key, base, ids);
    if (_facilitiesSelectedKey === key) return;
    _facilitiesSelectedKey = key;
    try {
        await request({
            url: base + '/account/settings/facilities/select?',
            method: 'POST',
            authtype: 'bearer',
            apikey: api_key,
            debug: DEBUG(),
            body: { facility_ids: ids }
        });
    } catch (e) { console.error('ensure_facilities_selected: ' + (e.stack || e)); }
};

// Bounded-concurrency map: runs fn over items at most `concurrency` at a time, preserving order.
const pmap = async (items, fn, concurrency = 5) => {
    let results = new Array(items.length);
    let next = 0;
    const worker = async () => {
        while (next < items.length) {
            let idx = next++;
            results[idx] = await fn(items[idx], idx);
        }
    };
    let workers = Math.max(1, Math.min(concurrency || 5, items.length || 1));  // never 0 workers (would leave undefined holes)
    await Promise.all(new Array(workers).fill(0).map(worker));
    return results;
};

// Opt-in response cache (default OFF — avoids read-after-write staleness in create flows).
// Turn on with RESPONSE_CACHE=true for read-heavy analysis sessions; clearResponseCache() to reset.
let RESPONSE_CACHE = false;
let _responseCache = new Map();
const clearResponseCache = () => _responseCache.clear();

// Canonical response extractors, shared by fetch_combined and the GET /list helpers.
// Items live under data.items on most endpoints, but a few use other keys — find the first array.
const pickItems = (r) => {
    let d = r && r.data;
    let candidates = [
        d && d.items, r.items,
        d && d.results, r.results,
        d && d.result, r.result,   // billing /features (user api_key) returns items under `result`
        d && d.list, r.list,
        d && d.data, Array.isArray(d) ? d : null
    ];
    for (let c of candidates) if (Array.isArray(c)) return c;
    return null; // shape not recognized
};
// Server total: /combined responses report data.total_items_count; /list responses may use
// total or total_items at either level — accept all three variants, nested first.
const pickTotal = (r) => {
    let d = (r && r.data) || {};
    return d.total_items_count ?? r.total_items_count
        ?? d.total_items ?? r.total_items
        ?? d.total ?? r.total ?? null;
};
// Next-page cursor for cursor-based endpoints (null = no more pages).
const pickCursor = (r) => {
    let d = (r && r.data) || {};
    return d.next_page_cursor ?? r.next_page_cursor
        ?? d.next_cursor ?? r.next_cursor
        ?? d.cursor ?? r.cursor ?? null;
};

// Page through a Route4Me /combined endpoint, accumulating up to `limit` items.
// `per_page` is the page-size cap (default/server-max 500; some endpoints cap lower, e.g. 100).
// Once page 1 reports total_items_count, remaining pages are fetched in parallel (bounded).
// `cursor` (default false) switches to CURSOR-BASED pagination: pass true to start fresh, or an
// initial cursor string to resume; pages then follow next_page_cursor sequentially (no `page` sent).
// Returns { items, total, ok, error, pages, truncated, cursor } — cursor = next cursor after the last
// fetched page (null = exhausted); truncated = more exist than returned.
// ---- entity response-schema validation (all list helpers) --------------------------------------
// A schema is inferred from the returned entities and cached in collection var `schema:<entity>:<code>`.
// On later runs the fresh schema is diffed against the cached baseline; drift -> console.warn.
// forceSchema (param) or ?schema=update|show refreshes/prints it. Also flags per-entry prop-set drift.
let SCHEMA_VALIDATE = true;                 // module switch: set false to disable all schema checks
const _typeOf = (v) => v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
const _inferSchema = (items) => {
    let props = {}, counts = {}, n = 0;
    for (let it of items) {
        if (!it || typeof it !== 'object' || Array.isArray(it)) continue;
        n++;
        for (let k of Object.keys(it)) { counts[k] = (counts[k] || 0) + 1; (props[k] = props[k] || new Set()).add(_typeOf(it[k])); }
    }
    let properties = {};
    for (let k of Object.keys(props).sort()) properties[k] = { type: [...props[k]].sort() };
    return { type: 'object', properties, required: Object.keys(counts).filter(k => counts[k] === n).sort(), _sampleSize: n };
};
const _schemaProps = (s) => Object.keys((s && s.properties) || {}).sort();
const validateSchema = (entity, code, items, { force = false, show = false } = {}) => {
    if (!SCHEMA_VALIDATE || !entity || !Array.isArray(items) || !items.length) return;
    let qs = (query.schema || '').toString().toLowerCase();
    force = force || qs === 'update' || query.updateSchema === 'true' || query.updateSchema === true;
    show = show || force || qs === 'show' || qs === 'print';

    let key = 'schema:' + entity + ':' + (code || 200);
    let current = _inferSchema(items);
    let saved = null; try { let raw = pm.collectionVariables.get(key); if (raw) saved = JSON.parse(raw); } catch (e) {}

    if (force || !saved) {
        pm.collectionVariables.set(key, JSON.stringify(current));
        if (show) console.info('schema ' + key + (saved ? ' (updated)' : ' (baseline saved)') + ':\n' + JSON.stringify(current, null, 2));
        saved = current;
    } else {
        let a = _schemaProps(saved), b = _schemaProps(current);
        let added = b.filter(k => !a.includes(k)), removed = a.filter(k => !b.includes(k));
        let typeChg = b.filter(k => a.includes(k) && JSON.stringify(saved.properties[k].type) !== JSON.stringify(current.properties[k].type))
                       .map(k => k + ' ' + JSON.stringify(saved.properties[k].type) + '→' + JSON.stringify(current.properties[k].type));
        let reqAdd = current.required.filter(k => !saved.required.includes(k));
        let reqRem = saved.required.filter(k => !current.required.includes(k));
        if (added.length || removed.length || typeChg.length || reqAdd.length || reqRem.length) {
            console.warn('schema CHANGED ' + key + ':'
                + (added.length ? '\n  + added: ' + added.join(', ') : '')
                + (removed.length ? '\n  - removed: ' + removed.join(', ') : '')
                + (typeChg.length ? '\n  ~ type: ' + typeChg.join('; ') : '')
                + (reqAdd.length ? '\n  + now required: ' + reqAdd.join(', ') : '')
                + (reqRem.length ? '\n  - now optional: ' + reqRem.join(', ') : '')
                + '\n  (forceSchema / ?schema=update to accept)');
        }
    }
    // per-entry property-set consistency vs the baseline
    let expected = new Set(_schemaProps(saved)), expArr = [...expected], issues = [];
    items.forEach((it, i) => {
        if (!it || typeof it !== 'object' || Array.isArray(it)) return;
        let keys = Object.keys(it);
        let extra = keys.filter(k => !expected.has(k)), missing = expArr.filter(k => !keys.includes(k));
        if (extra.length || missing.length) issues.push('#' + i + (extra.length ? ' +[' + extra.join(',') + ']' : '') + (missing.length ? ' -[' + missing.join(',') + ']' : ''));
    });
    if (issues.length) console.warn('schema ' + entity + ': ' + issues.length + '/' + items.length + ' entries differ in properties: ' + issues.slice(0, 10).join(' | ') + (issues.length > 10 ? ' …' : ''));
};

let fetch_combined = async ({ url, api_key, body = {}, limit = 500, per_page = 500, debug = null, label = '', cache = RESPONSE_CACHE, concurrency = 5, cursor = false, schema = true, forceSchema = false } = {}) => {
    const MAX = Math.min(per_page || 500, 500);
    const _entity = (label || '').replace(/\(\)\s*$/, '').trim() || null;
    const _validate = (rows) => { if (schema) try { validateSchema(_entity, 200, rows, { force: forceSchema }); } catch (e) {} };
    const cacheKey = JSON.stringify([url, api_key, body, limit, MAX, cursor]);
    if (cache && _responseCache.has(cacheKey)) return _responseCache.get(cacheKey);

    // ensure the account's facility selection is set before listing (de-duped per run)
    let _m = '/modules/api/v5.0';
    let _idx = (url || '').indexOf(_m);
    if (_idx >= 0) await ensure_facilities_selected(api_key, url.slice(0, _idx + _m.length));

    const fetchBody = async (pageBody) => {
        let response = await request({
            url: url, method: 'POST', authtype: 'bearer', apikey: api_key,
            debug: debug || DEBUG(), body: pageBody
        });
        if (typeof response !== 'object' || response === null || response.error)
            return { ok: false, error: { reason: 'request_failed', status: response?.code ?? response?.status ?? null, response } };
        let chunk = pickItems(response);
        if (chunk === null)
            return { ok: false, error: { reason: 'unrecognized_shape', responseKeys: Object.keys(response), dataKeys: response.data ? Object.keys(response.data) : null } };
        return { ok: true, chunk, total: pickTotal(response), cursor: pickCursor(response) };
    };
    const fetchPage = (p, pp) => fetchBody({ ...body, page: p, per_page: pp });

    let items = [], total = null, ok = true, error = null, pages = 0, nextCursor = null;

    // --- cursor mode: sequential, follow next_page_cursor until exhausted or limit reached ---
    if (cursor !== false && cursor != null) {
        let cur = (cursor === true) ? null : cursor;
        while (items.length < limit) {
            let pp = Math.min(MAX, limit - items.length);
            let cb = { ...body, per_page: pp };
            delete cb.page;
            if (cur != null) cb.cursor = cur;
            let pr = await fetchBody(cb); pages++;
            if (!pr.ok) { ok = false; error = pr.error; console.error(`fetch_combined ${label || url}: ${pr.error.reason} (cursor ${cur})`); break; }
            total = pr.total ?? total;
            items.push(...pr.chunk);
            nextCursor = pr.cursor;
            if (nextCursor == null || pr.chunk.length === 0) break;
            cur = nextCursor;
        }
        let slicedC = items.slice(0, limit);
        let truncatedC = nextCursor != null || (total != null ? total > slicedC.length : items.length > slicedC.length);
        let resultC = { items: slicedC, total: total ?? slicedC.length, ok, error, pages, truncated: truncatedC, cursor: nextCursor };
        if (ok) _validate(slicedC);
        if (cache && ok) _responseCache.set(cacheKey, resultC);
        return resultC;
    }

    // --- page mode (default) ---
    let startPage = body.page || 1;
    let firstPer = Math.min(MAX, limit);

    let p1 = await fetchPage(startPage, firstPer); pages++;
    if (!p1.ok) {
        ok = false; error = p1.error;
        console.error(`fetch_combined ${label || url}: ${error.reason} (page ${startPage}) ${JSON.stringify(error)}`);
    } else {
        total = p1.total ?? total;
        items.push(...p1.chunk);
        let wantMore = p1.chunk.length === firstPer && items.length < limit;

        if (wantMore && total != null && limit > MAX && startPage === 1) {
            // total known -> fetch remaining full pages in parallel
            let lastPage = Math.ceil(Math.min(limit, total) / MAX);
            let rest = [];
            for (let p = 2; p <= lastPage; p++) rest.push(p);
            let prs = await pmap(rest, (p) => fetchPage(p, MAX), concurrency);
            for (let pr of prs) {
                pages++;
                if (!pr || !pr.ok) { ok = false; error = (pr && pr.error) || { reason: 'no_result' }; console.error(`fetch_combined ${label || url}: ${error.reason}`); break; }
                items.push(...pr.chunk);
            }
        } else if (wantMore) {
            // total unknown (or resuming from page>1) -> sequential
            let page = startPage + 1;
            while (items.length < limit) {
                let pp = Math.min(MAX, limit - items.length);
                let pr = await fetchPage(page, pp); pages++;
                if (!pr.ok) { ok = false; error = pr.error; console.error(`fetch_combined ${label || url}: ${pr.error.reason} (page ${page})`); break; }
                total = pr.total ?? total;
                items.push(...pr.chunk);
                if (pr.chunk.length < pp) break;
                page++;
            }
        }
    }

    let sliced = items.slice(0, limit);
    let truncated = total != null ? total > sliced.length : items.length > sliced.length;
    let result = { items: sliced, total: total ?? sliced.length, ok, error, pages, truncated, cursor: null };
    if (ok) _validate(sliced);
    if (cache && ok) _responseCache.set(cacheKey, result);
    return result;
};

// Post-response pagination handle for hand-built requests.
// Put {{cursor}} / {{pagenum}} in your request (query string or body), then in the
// post-response script call e.paginate() — it reads the CURRENT response and populates
// those variables for the NEXT request:
//   pagenum  -> incremented page number
//   cursor   -> next_page_cursor (or '' when exhausted)
// Returns { page, pagenum, cursor, items, total, done }. Use done to stop a runner:
//   if (e.paginate().done) postman.setNextRequest(null);
// Options: data (response json; defaults to the current response), per_page (enables
// short-page done-detection on page-based endpoints), scope 'collection'|'environment'|'globals',
// cursorVar/pageVar (variable names), reset:true (start over at page 1, empty cursor).
const paginate = ({ data = null, per_page = null, scope = 'collection', cursorVar = 'cursor', pageVar = 'pagenum', reset = false } = {}) => {
    let store = scope === 'globals' ? pm.globals : (scope === 'environment' ? pm.environment : (pm.collectionVariables || pm.variables));
    if (reset) {
        store.set(cursorVar, '');
        store.set(pageVar, '1');
        return { page: 0, pagenum: 1, cursor: null, items: 0, total: null, done: false, reset: true };
    }
    let r = data || response;   // module-level parsed response of the current request
    let items = r ? (pickItems(r) || []) : [];
    let total = r ? pickTotal(r) : null;
    let next = r ? pickCursor(r) : null;
    let page = parseInt(store.get(pageVar)) || 1;

    let done = next != null ? false
        : (items.length === 0
            || (per_page != null && items.length < per_page)
            || (total != null && page * (per_page || items.length) >= total));

    store.set(cursorVar, next != null ? String(next) : '');
    store.set(pageVar, String(page + 1));
    return { page, pagenum: page + 1, cursor: next, items: items.length, total, done };
};

/**
 * @typedef {Object} ListResult  Normalized output of every list helper.
 * @property {Object.<string, Object>} by_id    item by its primary id
 * @property {Object.<string, Object>} by_name  item by display name (when the entity has one)
 * @property {Object[]} list                    all fetched items (each gets a normalized .id)
 * @property {number}   total                   server total when reported, else list length
 * @property {boolean}  ok                      false when a request/shape failure occurred
 * @property {?Object}  error                   { reason, status?, response? } when ok === false
 * @property {boolean}  [truncated]             more items exist server-side than were returned
 */
/**
 * @typedef {Object} ListParams  Standard params accepted by every list helper.
 * @property {?string} api_key      defaults to query.api_key
 * @property {?string} env          'prod'|'staging'; defaults to query.env
 * @property {?string} search_query server-side search
 * @property {?string} ids          comma-separated ids (alias: id)
 * @property {number}  [page=1]
 * @property {(boolean|string)} [cursor=false]  cursor pagination: true = start fresh, string = resume
 * @property {?Object} filters      merged LAST — overrides everything the helper set
 * @property {number}  [count=500]  total items target (pages until reached or exhausted)
 */
// Factory for standard /combined list helpers. Encapsulates the env/api_key preamble,
// base URL, payload assembly, pagination and the common by_id/by_name indexing + ok/error.
// spec: { entity, endpoint, idField?, nameField?, filterKey?, baseFilters?, orderBy?, groupBy?,
//         extraBody?, perPage?, init?(), transform?(item, output) }
/** @returns {function(ListParams=): Promise<ListResult>} */
const makeListHelper = (spec) => async ({ api_key=null, env=null, search_query=null, ids=null, id=null, page=1, cursor=false, filters=null, count=500, schema=true, forceSchema=false } = {}) => {
    let isPROD = resolveEnv(env);
    api_key = await resolveApiKey(api_key, env);

    let output = { by_id: {}, by_name: {}, list: [], total: 0, ok: true, error: null };
    if (spec.init) Object.assign(output, spec.init());  // pre-init entity-specific buckets

    let pf = Object.assign({}, spec.baseFilters || {});
    if (search_query) pf.search_query = search_query;
    ids = ids || id;
    if (ids && spec.filterKey) pf[spec.filterKey] = String(ids).split(',').map(s => s.trim()).filter(Boolean);
    if (filters) pf = Object.assign(pf, filters);

    let body = { page: page, filters: pf };
    if (spec.orderBy) body.order_by = spec.orderBy;
    if (spec.groupBy) body.group_by = spec.groupBy;
    if (spec.extraBody) Object.assign(body, spec.extraBody);  // e.g. { timezone: 'Europe/Kyiv' }

    let res = await fetch_combined({
        url: apiBase(isPROD) + spec.endpoint,
        api_key: api_key,
        cursor: cursor,
        body: body,
        limit: count,
        per_page: spec.perPage || 500,
        label: spec.entity + '()',
        schema: schema, forceSchema: forceSchema
    });
    res = res || { items: [], total: 0, ok: false, error: { reason: 'no_result' } };  // defensive: never read .ok off undefined
    output.ok = res.ok; output.error = res.error; output.total = res.total; output.truncated = res.truncated;

    try {
        res.items.forEach((a) => {
            if (spec.idField) {
                a.id = a[spec.idField];
                if (a[spec.idField] != null) output.by_id[a[spec.idField]] = output.by_id[a[spec.idField]] || a;
            }
            if (spec.nameField && a[spec.nameField] != null) output.by_name[a[spec.nameField]] = output.by_name[a[spec.nameField]] || a;
            output.list.push(a);
            if (spec.transform) spec.transform(a, output);
        });
    } catch (e) { console.error(spec.entity + '(): ' + e.stack); }

    return output;
};

const users = async ({ api_key=null, env=null, search_query=null, ids=null, id=null, page=1, cursor=false, filters=null, count=500 } = {}) => {
    let isPROD = resolveEnv(env);
    api_key = await resolveApiKey(api_key, env);

    let output = {
        'by_id': {},
        'by_email': {},
        'by_type': {},
        'by_role': {},
        'by_status': {},
        'by_skills': {},
        'list': []
    };

    let payload_filters = {
        "search_query": "",
        "OWNER_MEMBER_ID": [],
        "member_type": []
    };
    if (search_query) payload_filters.search_query = search_query;
    ids = ids || id;
    if (ids) payload_filters.member_id = ids.split(',').map(i => i.trim()).filter(i => i);
    if (filters) payload_filters = Object.assign(payload_filters, filters);

    let { items, total, ok, error, truncated } = await fetch_combined({
        url: apiBase(isPROD) + '/team/users/combined?',
        api_key: api_key,
        cursor: cursor,
        body: { page: page, filters: payload_filters },
        limit: count,
        label: 'users()'
    });

    // v4 call retained for debug parity; result unused in output
    await request({
        url: (isPROD ?  'https://api.route4me.com/api.v4' : 'https://api.routeml.com/api.v4') + `/user.php?`,
        method: 'GET',
        ...v4auth(api_key),
        debug: DEBUG(),
        encapsulated: 'results'
    });

    try {
        output.total = total; output.ok = ok; output.error = error; output.truncated = truncated;
        items.forEach((a) => {
            a.id = a.member_id;
            output.list.push(a);

            output.by_id[a.member_id] = output.by_id[a.member_id] || a;
            if (a.member_email) output.by_email[a.member_email] = output.by_email[a.member_email] || a;

            output.by_role[a.member_type] = output.by_role[a.member_type] || [];
            output.by_role[a.member_type].push(a);

            let status = a.status || (a.is_blocked ? 'blocked' : 'active');
            output.by_status[status] = output.by_status[status] || [];
            output.by_status[status].push(a);

            let user_skills = [];
            if (a.custom_data?.driver_skills) user_skills = user_skills.concat(a.custom_data?.driver_skills?.split(',').filter(ds => ds).map(ds => ds.trim()));
            if (a.custom_data?.tags) user_skills = user_skills.concat(a.custom_data?.tags?.split(',').filter(ds => ds).map(ds => ds.trim()));
            user_skills.forEach(us => {
                output.by_skills[us] = output.by_skills[us] || [];
                output.by_skills[us].push(a);
            });
        });

    } catch (e) {console.error(e.stack)}

    output.by_type = output.by_role;

    //group({ name:`USERS (${env}:${api_key})`, data: output.list, criteries: 'member_type' });
    return output;
}
const team = users;

const crews = async ({ api_key=null, env=null, search_query='', member_ids='', ids=null, id=null, page=1, cursor=false, filters=null, count=500 } = {}) => {
    let isPROD = resolveEnv(env);
    api_key = await resolveApiKey(api_key, env);

    let output = {
        'by_id': {},
        'by_name': {},
        'by_member': {},
        'list': []
    };

    let payload_filters = {
        "search_query": search_query || '',
        "member_id": member_ids.split(',').map(m => m.trim()).filter(m => m)
    };
    ids = ids || id;
    if (ids) payload_filters.crew_id = ids.split(',').map(i => i.trim()).filter(i => i);
    if (filters) payload_filters = Object.assign(payload_filters, filters);

    let { items, total, ok, error, truncated } = await fetch_combined({
        url: apiBase(isPROD) + '/team/crews/combined?',
        api_key: api_key,
        cursor: cursor,
        body: { page: page, filters: payload_filters },
        limit: count,
        label: 'crews()'
    });

    try {
        output.total = total; output.ok = ok; output.error = error; output.truncated = truncated;
        items.forEach((a) => {
            a.id = a.crew_id;
            output.list.push(a);

            output.by_id[a.crew_id] = output.by_id[a.crew_id] || a;
            if (a.crew_name) output.by_name[a.crew_name] = output.by_name[a.crew_name] || a;

            for (let member of (a.members || [])) {
                output.by_member[member.member_id] = output.by_member[member.member_id] || [];
                output.by_member[member.member_id].push(a);
            }
        });

    } catch (e) {console.error(e.stack)}

    //group({ name:`CREWS (${env}:${api_key})`, data: output.list, criteries: 'crew_name' });
    return output;
}

const vehicles = async ({ api_key=null, env=null, status='active', search_query=null, ids=null, id=null, page=1, cursor=false, filters=null, count=500 } = {}) => {
    let isPROD = resolveEnv(env);
    api_key = await resolveApiKey(api_key, env);

    let output = {
        'by_id': {},
        'by_uuid': {},
        'by_name': {},
        'by_alias': {},
        'by_license_plate': {},
        'by_profile': {},
        'by_profile_id': {},
        'with_profile': [],
        'by_skills': {},
        'by_status': {},
        'list': []
    };

    let payload_filters = {};
    if (status === 'active') payload_filters.active = true;
    if (search_query) payload_filters.search_query = search_query;
    ids = ids || id;
    if (ids) payload_filters.vehicle_ids = ids.split(',').map(i => i.trim()).filter(i => i);
    if (filters) payload_filters = Object.assign(payload_filters, filters);

    let { items, total, ok, error, truncated } = await fetch_combined({
        url: apiBase(isPROD)
        + '/vehicles/combined?',
        api_key: api_key,
        cursor: cursor,
        body: { page: page, filters: payload_filters },
        limit: count,
        label: 'vehicles()'
    });

    try {
        output.total = total; output.ok = ok; output.error = error; output.truncated = truncated;
        items.forEach((a) => {
            a.id = a.vehicle_id;
            output.list.push(a);

            output.by_id[a.vehicle_id] = output.by_id[a.vehicle_id] || a;
            if (a.vehicle_guid) output.by_uuid[a.vehicle_guid] = output.by_uuid[a.vehicle_guid] || a;
            if (a.vehicle_alias) {
                output.by_alias[a.vehicle_alias] = output.by_alias[a.vehicle_alias] || a;
                output.by_name[a.vehicle_alias] = output.by_name[a.vehicle_alias] || a;
            }
            if (a.license_plate) output.by_license_plate[a.license_plate] = output.by_license_plate[a.license_plate] || a;

            output.by_profile[a.vehicle_profile_name] = output.by_profile[a.vehicle_profile_name] || [];
            output.by_profile[a.vehicle_profile_name].push(a);
            if (a.vehicle_profile_id) {
                output.by_profile_id[a.vehicle_profile_id] = output.by_profile_id[a.vehicle_profile_id] || [];
                output.by_profile_id[a.vehicle_profile_id].push(a);
            }
            if (a.vehicle_profile_name) output.with_profile.push(a);

            output.by_status[a.status] = output.by_status[a.status] || [];
            output.by_status[a.status].push(a);

            (a?.skills || []).forEach(ds => {
                let vs = 'skill_' + ds;
                output.by_skills[vs] = output.by_skills[vs] || [];
                output.by_skills[vs].push(a);
            });
        });
    } catch (e) {console.error(e.stack)}

    //group({ name: `VEHICLES (${env}:${api_key})`, data: output.list, criteries: 'vehicle_profile_name' });
    return output;
}

const vehicle_profiles = makeListHelper({
    entity: 'vehicle_profiles',
    endpoint: '/vehicle-profiles/combined?',
    idField: 'vehicle_profile_id',
    nameField: 'name',
    filterKey: 'vehicle_profile_ids',
    init: () => ({ by_default: { yes: [], no: [] } }),
    transform: (a, o) => { o.by_default[a.is_default ? 'yes' : 'no'].push(a); }
});

// Vehicle capacity profiles use a GET /list endpoint with bracket-notation query params
// (merge_pages returns all pages in one response, so no client-side pagination).
//   page, per_page, filters: {max_volume: ...}, order_by: ['max_volume','desc'] | [['f','desc'],...] | {f:'desc'}
const vehicle_capacity_profiles = async ({ api_key=null, env=null, search_query=null, ids=null, id=null, page=1, per_page=100, filters=null, order_by=null, merge_pages=true, count=null } = {}) => {
    let isPROD = resolveEnv(env);
    api_key = await resolveApiKey(api_key, env);

    let output = { by_id: {}, by_name: {}, by_default: { yes: [], no: [] }, list: [], total: 0, ok: true, error: null };

    // normalize order_by to [[field, dir], ...]
    let ob = [];
    if (Array.isArray(order_by)) ob = (Array.isArray(order_by[0]) ? order_by : (order_by.length ? [order_by] : []));
    else if (order_by && typeof order_by === 'object') ob = Object.entries(order_by);

    // assemble filters
    let f = Object.assign({}, filters || {});
    if (search_query) f.search_query = search_query;
    ids = ids || id;
    if (ids) f.vehicle_capacity_profile_ids = String(ids).split(',').map(s => s.trim()).filter(Boolean);

    // build bracket-notation query string
    let qs = ['merge_pages=' + (merge_pages ? 'true' : 'false'), 'page=' + page, 'per_page=' + (count || per_page)];
    for (let [k, v] of Object.entries(f)) {
        if (Array.isArray(v)) v.forEach((vv, i) => qs.push(`filters[${k}][${i}]=` + encodeURIComponent(vv)));
        else qs.push(`filters[${encodeURIComponent(k)}]=` + encodeURIComponent(v));
    }
    ob.forEach((pair, i) => {
        qs.push(`order_by[${i}][0]=` + encodeURIComponent(pair[0]));
        qs.push(`order_by[${i}][1]=` + encodeURIComponent((pair[1] || 'asc')));
    });

    let res = await request({
        url: apiBase(isPROD) + '/vehicle-capacity-profiles/list?' + qs.join('&'),
        method: 'GET',
        authtype: 'bearer',
        apikey: api_key,
        debug: DEBUG()
    });

    if (typeof res !== 'object' || res === null || res.error) {
        output.ok = false; output.error = res;
        console.error('vehicle_capacity_profiles() ' + JSON.stringify(res));
        return output;
    }

    // shared canonical extractors (same as fetch_combined): handles /combined's data.total_items_count
    // and /list's total / total_items at either nesting level
    let items = pickItems(res) || [];

    try {
        output.total = pickTotal(res) ?? items.length;
        items.forEach((a) => {
            a.id = a.vehicle_capacity_profile_id;
            output.list.push(a);
            output.by_id[a.vehicle_capacity_profile_id] = output.by_id[a.vehicle_capacity_profile_id] || a;
            if (a.name) output.by_name[a.name] = output.by_name[a.name] || a;
            output.by_default[a.is_default ? 'yes' : 'no'].push(a);
        });
    } catch (e) { console.error(e.stack); }

    return output;
}


const equipment_types = makeListHelper({
    entity: 'equipment_types',
    endpoint: '/equipment-types/combined?',
    idField: 'equipment_type_id',
    nameField: 'name',
    filterKey: 'equipment_type_ids',
    init: () => ({
        by_vehicle_profiles: { with: [], without: [] },
        by_capacility_profiles: { with: [], without: [] },
        by_break_profiles: { with: [], without: [] },
        by_skills: { with: [], without: [] }
    }),
    transform: (a, o) => {
        o.by_vehicle_profiles[a.vehicle_profile_ids?.length ? 'with' : 'without'].push(a);
        o.by_capacility_profiles[a.vehicle_capacity_profile_ids?.length ? 'with' : 'without'].push(a);
        o.by_break_profiles[a.break_profile_ids?.length ? 'with' : 'without'].push(a);
        o.by_skills[a.skill_ids?.length ? 'with' : 'without'].push(a);
    }
});

const break_profiles = makeListHelper({
    entity: 'break_profiles',
    endpoint: '/break-profiles/combined?',
    idField: 'break_profile_id',
    nameField: 'name',
    filterKey: 'break_profile_ids',
    groupBy: 'none',
    init: () => ({ by_rules_count: {} }),
    transform: (a, o) => {
        if (a.rules_count != null) {
            o.by_rules_count[a.rules_count] = o.by_rules_count[a.rules_count] || [];
            o.by_rules_count[a.rules_count].push(a);
        }
    }
});

const optimization_profiles = async ({ api_key=null, env=null, search_query='', ids=null, id=null, mode=null, page=1, cursor=false, filters=null, count=500 } = {}) => {
    let isPROD = resolveEnv(env);
    api_key = await resolveApiKey(api_key, env);

    ids = (ids || id)?.split(',')?.map(op => op.trim())?.filter(op => op) || [];

    let profile_guid_verbose = (parts) => {
        return parts.map(ap => {
            ap.data = ap.data || {};
            ap.data.guid = ap.guid;
            if (ap.guid == 'pah') return ['user', ap.data];
            if (ap.guid == 'pax') return ['vehicle', ap.data];
            if (ap.guid == 'pbg') return ['breaks', ap.data];
            if (ap.guid == 'pba') return ['bundling', ap.data];
            if (ap.guid == 'pab') return ['depots', ap.data];
            if (ap.guid == 'pan') return ['time_windows', ap.data];
            if (ap.guid == 'pbb') return ['is_default', ap.data];
            if (ap.guid == 'pao') return ['max_distance', ap.data];
            if (ap.guid == 'pbc') return ['max_pieces', ap.data];
            if (ap.guid == 'pam') return ['max_revenue', ap.data];
            if (ap.guid == 'pal') return ['max_stops', ap.data];
            if (ap.guid == 'pap') return ['max_volume', ap.data];
            if (ap.guid == 'pak') return ['max_weight', ap.data];
            if (ap.guid == 'pbe') return ['mixed_fleet', ap.data];
            if (ap.guid == 'paq') return ['route_balance_minimize', ap.data];
            if (ap.guid == 'pbd') return ['prioritize', ap.data];
            if (ap.guid == 'pae') return ['optimization_enabled', ap.data];
            if (ap.guid == 'pai') return ['profile_name', ap.data];
            if (ap.guid == 'paj') return ['max_route_duration', ap.data];
            if (ap.guid == 'paf') return ['route_end', ap.data];
            if (ap.guid == 'paa') return ['route_name', ap.data];
            if (ap.guid == 'pac') return ['start_time', ap.data];
            if (ap.guid == 'pad') return ['override_service_time', ap.data];
            if (ap.guid == 'pag') return ['service_time_slowdown', ap.data];
            if (ap.guid == 'paz') return ['travel_time_slowdown', ap.data];
            if (ap.guid == 'prh') return ['avoid_highways_tolls', ap.data];
            if (ap.guid == 'prc') return ['turn_avoidance', ap.data];
            if (ap.guid == 'pfa') return ['facilities', ap.data];
            if (ap.guid == 'pav') return ['append_date_to_route_name', ap.data];
            if (ap.guid == 'dac') return ['use_depot_as_advanced_constraint', ap.data];
            if (ap.guid == 'par') return ['max_distance_between_destinations', ap.data];
            if (ap.guid == 'psc') return ['speed_cap', ap.data];
            if (ap.guid == 'pet') return ['equipment_types', ap.data];
        })
        .filter(e => e);  
    }

    let output = {
        'by_id': {},
        'by_name': {},
        'by_default': {'yes': [], 'no': []},
        'list': []
    };

    let payload_filters = {};
    if (search_query) payload_filters.search_query = search_query;
    if (filters) payload_filters = Object.assign(payload_filters, filters);

    let listProfiles = async () => {
        let { items } = await fetch_combined({
            url: apiBase(isPROD)
            + '/optimization-profiles/list?',
            api_key: api_key,
            cursor: cursor,
            body: {
                page: page,
                filters: payload_filters,
                order_by: [],
                initial_request: false,
                timezone: "Europe/Kyiv"
            },
            limit: count,
            label: 'optimization_profiles()'
        });
        return items;
    };

    let optimization_profiles_entities = [];

    if (mode == 'parts') {
        let target_ids = ids.length
            ? ids
            : (await listProfiles()).map(op => op.optimization_profile_id);

        optimization_profiles_entities = await request({
            url: apiBase(isPROD) + '/optimization-profiles/get-entities?',
            method: 'POST',
            authtype: 'bearer',
            apikey: api_key,
            debug: DEBUG(),
            body: { 'items': target_ids.map(id => ({ id })) },
            encapsulated: 'items'
        });

    } else if (ids.length > 0) {
        for (let profile_id of ids) {
            let profile = await request({
                url: apiBase(isPROD) + `/optimization-profiles/${profile_id}?`,
                method: 'GET',
                authtype: 'bearer',
                apikey: api_key,
                debug: DEBUG(),
                encapsulated: 'data'
            });
            if (profile) optimization_profiles_entities.push(profile);
        }
    } else {
        optimization_profiles_entities = await listProfiles();
    }

    try {
        if (typeof optimization_profiles_entities !== 'object' || optimization_profiles_entities.error) console.error('optimization_profiles()' + JSON.stringify(optimization_profiles_entities));
        output.total = optimization_profiles_entities.length;

        optimization_profiles_entities.forEach((a) => {
            a.id = a?.id || a?.optimization_profile_id;

            let name = a?.parts?.filter(ap => ap.guid == 'pai')[0]?.data?.profile_name || a.profile_name;
            let is_default = a?.parts?.filter(ap => ap.guid == 'pbb')[0]?.data?.is_default ?? a.is_default;

            if (mode == 'parts') {
                let profile_readable = Object.fromEntries(Object.entries(a));
                profile_readable.parts = Object.fromEntries(profile_guid_verbose(a.parts));
                profile_readable.id = a.optimization_profile_id;

                let missing_parts = ["pah","pax","pbg","pba","pab","pan","pbb","pao","pbc","pam","pal","pap","pak","pbe","paq","pbd","pae","pai","paj","paf","paa","pac","pad","pag","paz","prh","prc","pav","pfa","dac","par","psc","pet"]
                    .map(guid => {
                        if (!a.parts.some(ap => ap.guid === guid)) return { 'guid': guid };
                    })
                    .filter(ap => ap);

                missing_parts = Object.fromEntries(profile_guid_verbose(missing_parts));

                a.missing_parts = missing_parts;
                profile_readable.missing_parts = missing_parts;
                output.by_id_readable = output.by_id_readable || {};
                output.by_name_readable = output.by_name_readable || {};
                output.by_id_readable[a.id] = output.by_id_readable[a.id] || profile_readable;
                if (name) output.by_name_readable[name] = output.by_name_readable[name] || profile_readable;
            }

            output.list.push(a);
            output.by_id[a.optimization_profile_id] = output.by_id[a.optimization_profile_id] || a;
            if (name) output.by_name[name] = output.by_name[name] || a;
            output.by_default[is_default ? 'yes' : 'no'].push(a);
        });

    } catch (e) { console.error(e.stack)}

    return output;
}

const orders = async ({ api_key=null, env=null, route_id=null, search_query=null, barcode=null, ids=null, id=null, page=1, cursor=false, filters=null, count=500 } = {}) => {
    let isPROD = resolveEnv(env);
    api_key = await resolveApiKey(api_key, env);

    let output = {
        'by_id': {},
        'by_uuid': {},
        'by_status': {},
        'by_address': {},
        'by_route_id': {},
        'by_customer': {},
        'by_barcode': {},
        'list': []
    };

    let payload_filters = {
        "view_mode": "all",
        "prev_view_mode": "all",
        "day_added_YYMMDD": [
            moment().subtract('month', 13).format('YYYY-MM-DD'),
            moment().add('month', 1).format('YYYY-MM-DD')
        ]
    };
    if (search_query) payload_filters.search_query = search_query;
    if (route_id) payload_filters.route_id = route_id;
    if (barcode) payload_filters.barcode = barcode;
    ids = ids || id;
    if (ids) payload_filters.order_ids = ids.split(',').map(i => i.trim()).filter(i => i);
    if (filters) payload_filters = Object.assign(payload_filters, filters);

    let { items, total, ok, error, truncated } = await fetch_combined({
        url: apiBase(isPROD) + '/orders/list/combined?',
        api_key: api_key,
        cursor: cursor,
        body: { page: page, order_by: [], filters: payload_filters, timezone: "Europe/Kyiv" },
        limit: count,
        label: 'orders()'
    });

    try {
        output.total = total; output.ok = ok; output.error = error; output.truncated = truncated;
        items.forEach((a) => {
            a.id = a.order_id;
            output.list.push(a);

            output.by_id[a.order_id] = output.by_id[a.order_id] || a;
            if (a.order_uuid) output.by_uuid[a.order_uuid] = output.by_uuid[a.order_uuid] || a;

            output.by_status[a.last_status] = output.by_status[a.last_status] || [];
            output.by_status[a.last_status].push(a);

            output.by_address[a.address_1] = output.by_address[a.address_1] || [];
            output.by_address[a.address_1].push(a);

            if (a.route_id) {
                output.by_route_id[a.route_id] = output.by_route_id[a.route_id] || [];
                output.by_route_id[a.route_id].push(a);
            }
            if (a.customer_id) {
                output.by_customer[a.customer_id] = output.by_customer[a.customer_id] || [];
                output.by_customer[a.customer_id].push(a);
            }
            if (a.barcode) output.by_barcode[a.barcode] = output.by_barcode[a.barcode] || a;
        });

    } catch (e) { console.error(e.stack)}

    //group({ name: `ORDERS (${env}:${api_key})`, data: output.list, criteries: 'last_status' });
    return output;
}

const addresses = makeListHelper({
    entity: 'addresses',
    endpoint: '/address-book/addresses/list/combined?',
    idField: 'address_id',
    filterKey: 'address_ids',
    baseFilters: { display: 'all' },
    orderBy: [],
    extraBody: { timezone: 'Europe/Kyiv' },
    init: () => ({ by_uuid: {}, by_alias: {}, by_address: {}, by_customer_id: {}, by_customer: { with: [], without: [] } }),
    transform: (a, o) => {
        if (a.address_uuid) o.by_uuid[a.address_uuid] = o.by_uuid[a.address_uuid] || a;
        if (a.address_alias) o.by_alias[a.address_alias] = o.by_alias[a.address_alias] || a;
        o.by_address[a.address_1] = o.by_address[a.address_1] || [];
        o.by_address[a.address_1].push(a);
        if (a.customer_id) {
            o.by_customer_id[a.customer_id] = o.by_customer_id[a.customer_id] || [];
            o.by_customer_id[a.customer_id].push(a);
        }
        o.by_customer[a.customer_name ? 'with' : 'without'].push(a);
    }
});
const locations = addresses;

const customers = makeListHelper({
    entity: 'customers',
    endpoint: '/customers/list/combined?',
    idField: 'customer_id',
    nameField: 'name',
    filterKey: 'customer_ids',
    baseFilters: { display: 'all' },
    orderBy: [],
    extraBody: { timezone: 'Europe/Kyiv' },
    init: () => ({ by_uuid: {}, by_email: {}, by_contract: { with: [], without: [] } }),
    transform: (a, o) => {
        if (a.customer_uuid) o.by_uuid[a.customer_uuid] = o.by_uuid[a.customer_uuid] || a;
        if (a.email) o.by_email[a.email] = o.by_email[a.email] || a;
        o.by_contract[a.contracts?.length ? 'with' : 'without'].push(a);
    }
});

// assets — POST /assets/combined. Filter by facility with assets({ filters: { facility_ids: [...] } }).
// by_id (asset_id) / by_name (display_name) / by_identifier (internal_identifier) = single (first wins);
// by_type / by_type_id / by_category = arrays of assets sharing that label/id.
const assets = makeListHelper({
    entity: 'assets',
    endpoint: '/assets/combined?',
    idField: 'asset_id',
    nameField: 'display_name',
    filterKey: 'asset_ids',
    init: () => ({ by_identifier: {}, by_type: {}, by_type_id: {}, by_category: {} }),
    transform: (a, o) => {
        if (a.internal_identifier) o.by_identifier[a.internal_identifier] = o.by_identifier[a.internal_identifier] || a;
        if (a.asset_type_label) (o.by_type[a.asset_type_label] = o.by_type[a.asset_type_label] || []).push(a);
        if (a.asset_type_id) (o.by_type_id[a.asset_type_id] = o.by_type_id[a.asset_type_id] || []).push(a);
        if (a.asset_category_type_label) (o.by_category[a.asset_category_type_label] = o.by_category[a.asset_category_type_label] || []).push(a);
    }
});

const contracts = makeListHelper({
    entity: 'contracts',
    endpoint: '/customers/contracts/combined?',
    idField: 'contract_id',
    nameField: 'name',
    filterKey: 'contract_ids',
    orderBy: [],
    init: () => ({ by_uuid: {}, by_customer_id: {} }),
    transform: (a, o) => {
        if (a.contract_uuid) o.by_uuid[a.contract_uuid] = o.by_uuid[a.contract_uuid] || a;
        if (a.customer_id) {
            o.by_customer_id[a.customer_id] = o.by_customer_id[a.customer_id] || [];
            o.by_customer_id[a.customer_id].push(a);
        }
    }
});


const route_relations = async ({ api_key=null, env=null, id=null, route_id=null } = {}) => {
    let isPROD = resolveEnv(env);    
    api_key = await resolveApiKey(api_key, env);

    let output = {
        'by_id': {},    
        'by_type': {},   
        'list': []
    }; 
    route_id = route_id || id;

    let relations_output = await request({
        url: apiBase(isPROD) 
        + `/routes/${route_id}/relations`,
        method: 'GET',
        authtype: 'bearer', 
        apikey: api_key,
        debug: DEBUG()
    });      

    if (typeof relations_output !== 'object' || relations_output.error) console.error('relations()' + JSON.stringify(relations_output))

    try {

        output.total = relations_output.length;
        relations_output.data.forEach((a) => {
            a.id = a.object_id;

            output.list.push(a);
            output.by_id[a.object_id] = output.by_id[a.object_id] || a;
            output.by_type[a.object_type] = output.by_type[a.object_type] || a;            
        });

    } catch (e) { console.error(e.stack)}

    //group({ name: `ROTUE RELATIONS (${env}:${api_key})`, data: output.list, criteries: 'name	' });
    return output;
}

const workflows = async ({ api_key=null, env=null, search_query=null, ids=null, id=null, page=1, cursor=false, filters=null, count=500 } = {}) => {
    let isPROD = resolveEnv(env);
    api_key = await resolveApiKey(api_key, env);

    let output = {
        'by_id': {},
        'by_name': {},
        'by_uuid': {},
        'by_guid': {},
        'by_status': {},
        'by_action': {},
        'list': []
    };

    let payload_filters = {};
    if (search_query) payload_filters.search_query = search_query;
    ids = ids || id;
    if (ids) payload_filters.workflow_ids = ids.split(',').map(i => i.trim()).filter(i => i);
    if (filters) payload_filters = Object.assign(payload_filters, filters);

    let { items, total, ok, error, truncated } = await fetch_combined({
        url: apiBase(isPROD)
        + '/workflows/list/combined?',
        api_key: api_key,
        cursor: cursor,
        body: { page: page, order_by: [["last_updated_timestamp", "desc"]], filters: payload_filters },
        limit: count,
        label: 'workflows()'
    });

    try {
        let workflows = items;
        output.total = total; output.ok = ok; output.error = error; output.truncated = truncated;
        workflows.forEach((a) => {
            a.id = a.workflow_id;

            output.list.push(a);

            output.by_name[a.workflow_id] = output.by_name[a.workflow_id] || a;
            output.by_id[a.workflow_id] = output.by_id[a.workflow_id] || a;
            output.by_uuid[a.workflow_guid] = output.by_uuid[a.workflow_guid] || a;
            output.by_guid[a.workflow_guid] = output.by_guid[a.workflow_guid] || a;

            let status = a.is_enabled ? 'enabled' : 'disabled';

            output.by_status[status] = output.by_status[status] || [];
            output.by_status[status].push(a);
            for (let action of a.done_actions) {
                output.by_action[action.type] = output.by_action[action.type] || [];
                output.by_action[action.type].push(a);
            }
            for (let action of a.failed_actions) {
                output.by_action[action.type] = output.by_action[action.type] || [];
                output.by_action[action.type].push(a);
            }
            
        });

    } catch (e) { console.error(e.stack)}

    //group({ name: `WORKFLOWS (${env}:${api_key})`, data: output.list, criteries: 'workflow_id' });
    return output;
}

const memberTypes = {
    'PRIMARY_ACCOUNT': {
        'type': 'PRIMARY_ACCOUNT',
        'title': 'owner',
        'short': 'own',
        'subs': ['SUB_ACCOUNT_ADMIN', 'SUB_ACCOUNT_REGIONAL_MANAGER', 'SUB_ACCOUNT_DISPATCHER', 'SUB_ACCOUNT_PLANNER', 'SUB_ACCOUNT_ANALYST', 'SUB_ACCOUNT_DRIVER', 'SUB_ACCOUNT_SORTER', 'SUB_ACCOUNT_SUPPORT'],
        'permissions': {}
    },
    'SUB_ACCOUNT_ADMIN': {
        'type': 'SUB_ACCOUNT_ADMIN',
        'title': 'admin',
        'short': 'adm',
        'subs': ['SUB_ACCOUNT_REGIONAL_MANAGER', 'SUB_ACCOUNT_DISPATCHER', 'SUB_ACCOUNT_PLANNER', 'SUB_ACCOUNT_ANALYST', 'SUB_ACCOUNT_DRIVER', 'SUB_ACCOUNT_SORTER', 'SUB_ACCOUNT_SUPPORT'],
        'permissions': {}
    },
    'SUB_ACCOUNT_REGIONAL_MANAGER': {
        'type': 'SUB_ACCOUNT_REGIONAL_MANAGER',
        'title': 'manager',
        'short': 'man',
        'subs': ['SUB_ACCOUNT_DISPATCHER', 'SUB_ACCOUNT_PLANNER', 'SUB_ACCOUNT_ANALYST', 'SUB_ACCOUNT_DRIVER'],
        'permissions': {
            'SHOW_SUSR_ORDERS': true,
            'READONLY_USER': false,
            'HIDE_NONFUTURE_ROUTES': false,
            'SHOW_ALL_DRIVERS': true,
        }
    },
    'SUB_ACCOUNT_DISPATCHER': {
        'type': 'SUB_ACCOUNT_DISPATCHER',
        'title': 'dispatcher',
        'short': 'dis',
        'subs': ['SUB_ACCOUNT_PLANNER', 'SUB_ACCOUNT_ANALYST', 'SUB_ACCOUNT_DRIVER'],
        'permissions': {}
    },
    'SUB_ACCOUNT_PLANNER': {
        'type': 'SUB_ACCOUNT_PLANNER',
        'title': 'Planner',
        'short': 'pl',
        'subs': ['SUB_ACCOUNT_ANALYST', 'SUB_ACCOUNT_DRIVER'],
        'permissions': {}
    },
    'SUB_ACCOUNT_ANALYST': {
        'type': 'SUB_ACCOUNT_ANALYST',
        'title': 'analyst',
        'short': 'an',
        'subs': [],
        'permissions': {}
    },
    'SUB_ACCOUNT_DRIVER': {
        'type': 'SUB_ACCOUNT_DRIVER',
        'title': 'driver',
        'short': 'drv',
        'subs': [],
        'permissions': {
            'SHOW_SUSR_ORDERS': true,
            'READONLY_USER': true,
            'HIDE_NONFUTURE_ROUTES': true,
            'SHOW_ALL_DRIVERS': true,
        }
    },
    'SUB_ACCOUNT_SORTER': {
        'type': 'SUB_ACCOUNT_SORTER',
        'title': 'sorter',
        'short': 'srt',
        'subs': [],
        'permissions': {
            'SHOW_SUSR_ORDERS': true
        }
    },
    'SUB_ACCOUNT_CUSTOMER_SUPPORT': {
        'type': 'SUB_ACCOUNT_CUSTOMER_SUPPORT',
        'title': 'support',
        'short': 'sup',
        'subs': [],
        'permissions': {
            'SHOW_SUSR_ORDERS': true,
            'READONLY_USER': false,
            'HIDE_NONFUTURE_ROUTES': false
        }
    },
};


// Postman Vault accessor (null-safe).
const vault = async (key) => { try { return await pm.vault.get(key); } catch (e) { console.error('vault: missing/unreadable "' + key + '"'); return null; } };

// POST /iam/authenticate — email/password login (no api_key). Pass creds explicitly, or fall back to
// vault secrets iam-email-{env} / iam-password-{env}. Returns the parsed auth response.
// NOTE: debug:[] is intentional — it suppresses the request's curl log so the password is never printed.
const authenticate = async ({ email = null, password = null, device_type = 'android_phone', env = null, wetrun = true } = {}) => {
    let isPROD = resolveEnv(env);
    let envKey = isPROD ? 'prod' : 'staging';
    if (!email) email = await vault('iam-email-' + envKey);
    if (!password) password = await vault('iam-password-' + envKey);
    if (!email || !password) { console.error('authenticate(): missing email/password (pass {email,password} or set vault iam-email-' + envKey + ' / iam-password-' + envKey + ')'); return null; }
    return await request({
        url: apiBase(isPROD) + '/iam/authenticate?wetrun=' + (wetrun ? 'true' : 'false') + '&env=' + envKey,
        method: 'POST',
        auth_type: 'none',
        body: { email, password, device_type },
        debug: [], sensitive: true
    });
};

// OAuth token via service impersonation — POST secure.*/oauth/token (x-www-form-urlencoded, SECRET-KEY auth).
// secret (SECRET-KEY header) defaults to vault `${env}-secret-general`; client_secret (body) defaults
// to vault `${env}-secret-admin-panel`. Returns the parsed token response.
// debug:[] so the secrets/body are never written to the console curl.
const token = async ({ env = null, secret = null, client_secret = null, client_id = null,
                       grant_type = 'service_impersonation', as = 'alexs@route4me.com',
                       reason = 'test', member_id = null } = {}) => {
    let isPROD = resolveEnv(env);
    let envKey = isPROD ? 'prod' : 'staging';
    if (client_id == null) client_id = isPROD ? 11 : 18;   // prod -> 11, staging -> 18 (override via {client_id})
    if (secret == null) secret = await vault(envKey + '-secret-general');
    if (client_secret == null) client_secret = await vault(envKey + '-secret-admin-panel');
    if (!secret) { console.error('token(): no SECRET-KEY (pass {secret} or set vault ' + envKey + '-secret-general)'); return null; }

    // `as` -> body actor_sub, `member_id` -> body requested_subject (API field names kept)
    let body = { client_secret, grant_type, client_id, actor_sub: as, reason };
    if (member_id != null) body.requested_subject = member_id;

    let base = isPROD ? 'https://secure.route4me.com' : 'https://secure.routeml.com';
    return await request({
        url: base + '/oauth/token?env=' + envKey,
        method: 'POST',
        auth_type: 'secret',
        apikey: secret,
        body_format: 'urlencoded',
        body: body,
        debug: [], sensitive: true
    });
};

const FEATURES_TTL = 48 * 3600;   // feature-catalog cache lifetime: 48h (seconds)
// Renew handle: drop the cached catalog so the next features() refetches. clearFeaturesCache() = both envs.
const clearFeaturesCache = (env = null) => {
    let names = env ? ['featuresCatalog_' + (resolveEnv(env) ? 'prod' : 'staging')] : ['featuresCatalog_prod', 'featuresCatalog_staging'];
    names.forEach(n => { try { pm.globals.unset ? pm.globals.unset(n) : pm.globals.set(n, ''); } catch (e) {} });
};

// Paginate a billing endpoint. Items come via the shared pickItems (data / result / items / ...).
// Follows links.next when present (JSON:API catalog); single-shot when absent (e.g. the user
// /features response which returns everything under `result` with no links).
const _paginateBilling = async (url, api_key) => {
    let out = [], page = 1, guard = 0;
    while (guard++ < 200) {
        let r = await request({ url: url + (url.includes('?') ? '&' : '?') + 'page[number]=' + page, method: 'GET', authtype: 'bearer', apikey: api_key, debug: DEBUG() });
        if (!r || typeof r !== 'object' || r.error) break;
        let chunk = pickItems(r) || [];
        out.push(...chunk);
        if (chunk.length === 0 || !(r.links && r.links.next != null)) break;
        page++;
    }
    return out;
};

// ALL available features (the catalog) from /billing-api/features using the SYSTEM token
// (Vault key billing-{{env}}-route4me, or pass api_key to override). Paginated, cached 48h.
// Pass { renew: true } (or call clearFeaturesCache()) to force a refetch.
const features = async ({ env = null, renew = false, api_key = null } = {}) => {
    env = env || query.env;
    let isPROD = resolveEnv(env);
    let envKey = isPROD ? 'prod' : 'staging';
    let cacheName = 'featuresCatalog_' + envKey;

    let output = { by_id: {}, by_key: {}, by_name: {}, readable: [], list: [], total: 0, timestamp: null, cached: false };

    let cached = pm.globals.get(cacheName);
    if (cached) { try { cached = JSON.parse(cached); } catch (e) { cached = null; } }
    let fresh = cached && cached.timestamp && (now() - cached.timestamp) < FEATURES_TTL;

    let list, ts;
    if (!renew && fresh) {
        list = cached.list || [];
        ts = cached.timestamp;
        output.cached = true;
    } else {
        let token = api_key || await vault('billing-' + envKey + '-route4me');
        if (!token) console.error('features(): no system token (vault billing-' + envKey + '-route4me)');
        list = await _paginateBilling(apiBase(isPROD, { billing: true }) + '/features', token);
        ts = now();
        pm.globals.set(cacheName, JSON.stringify({ timestamp: ts, list }));
    }

    output.list = list;
    output.total = list.length;
    output.timestamp = ts;
    list.forEach(f => {
        if (f.key != null) output.by_key[f.key] = f;
        if (f.name != null) output.by_name[f.name] = f;
        if (f.id != null) output.by_id[f.id] = f;
        output.readable.push(`${f.name} (${f.key})`);
    });
    return output;
}

// A user's features from /billing-api/features using the USER api_key, enriched with the
// catalog from features(). Each item is { feature_key, feature_name } by default.
//   full: true     -> also include the raw feature fields on each item
//   keysOnly: true -> list is an array of feature_key strings
const user_features = async ({ api_key = null, env = null, full = false, keysOnly = false } = {}) => {
    env = env || query.env;
    let isPROD = resolveEnv(env);
    api_key = await resolveApiKey(api_key, env);

    let catalog = await features({ env });   // system catalog (cached) for name enrichment
    let output = { by_key: {}, by_name: {}, keys: [], list: [], readable: [], total: 0 };

    let raw = await _paginateBilling(apiBase(isPROD, { billing: true }) + '/features', api_key);

    raw.forEach(f => {
        let name = catalog.by_key[f.key]?.name ?? f.name ?? null;
        let item = { feature_key: f.key, feature_name: name };
        if (full) item = Object.assign({}, f, item);
        let stored = keysOnly ? f.key : item;
        output.keys.push(f.key);
        output.list.push(stored);
        output.by_key[f.key] = stored;
        if (name) output.by_name[name] = stored;
        output.readable.push(`${name ?? '?'} (${f.key})`);
    });
    output.total = raw.length;
    return output;
}

const subscription = async ({ env=null, member_id=null, count=500 } = {}) => { 
    let isPROD = resolveEnv(env);    
    if (!member_id || member_id == '') console.error('subscritpion() no member_id');

    let output = {
        'by_id': {},
        'by_name': {},
        'by_status': {'active':[], 'expired':[]},
        'list': []
    };        

    let subscriptions = await request({
        url: apiBase(isPROD) 
        + `/billing-api/subscriptions/${member_id}?include=add-ons`,
        method: 'GET',
        authtype: 'bearer', 
        apikey: creds[env].route4me,
        debug: DEBUG(),
    });      

    if (typeof subscriptions !== 'object' || subscriptions.error) console.error('subscritpion()' + JSON.stringify(subscriptions))

    try {
        subscriptions = subscriptions.data;

        output.total = subscriptions.length;
        subscriptions.forEach((a) => {
            output.list.push(a);
            output.by_name[a.plan_code] = output.by_name[a.plan_code] || a;
            output.by_id[a.order_id] = output.by_id[a.order_id] || a;
            if (a.is_expired === false) output.by_status.active.push(a);
            else output.by_status.expired.push(a);
        });

    } catch (e) {console.error(e.stack)}

    //group({ name: `GRADUAL RELEASES (${env}:${api_key})`, data: output.list, criteries: 'name' });
    return output;
}

// releases items are plain strings (feature flag names), not objects.
const releases = makeListHelper({
    entity: 'releases',
    endpoint: '/gradual-release/combined?',
    transform: (a, o) => { o.by_name[a] = o.by_name[a] || a; }  // a is a string
});

const service_types = makeListHelper({
    entity: 'service_types',
    endpoint: '/common-dictionaries/service-types/combined?',
    idField: 'service_type_id',
    nameField: 'service_name',
    filterKey: 'service_type_ids',
    init: () => ({ by_code: {}, by_category: {}, by_type: { system: [], default: [], custom: [] } }),
    transform: (a, o) => {
        if (a.service_code) o.by_code[a.service_code] = o.by_code[a.service_code] || a;
        if (a.service_category_name) o.by_category[a.service_category_name] = o.by_category[a.service_category_name] || a;
        if (a.is_system === 'Yes') { o.by_type.system.push(a); o.by_type.default.push(a); }
        else o.by_type.custom.push(a);
    }
});

const work_schedules = async ({ api_key=null, env=null, search_query=null, ids=null, id=null, page=1, cursor=false, filters=null, count=500 } = {}) => {
    let isPROD = resolveEnv(env);
    api_key = await resolveApiKey(api_key, env);

    let output = {
        'by_id': {},
        'by_name': {},
        'by_code': {},
        'list': []
    };

    let payload_filters = {};
    if (search_query) payload_filters.search_query = search_query;
    ids = ids || id;
    if (ids) payload_filters.schedule_ids = ids.split(',').map(i => i.trim()).filter(i => i);
    if (filters) payload_filters = Object.assign(payload_filters, filters);

    let base = apiBase(isPROD);

    let { items: work_schedules, total, ok, error, truncated } = await fetch_combined({
        url: base + '/common-dictionaries/work-schedules/combined?',
        api_key: api_key,
        cursor: cursor,
        body: { page: page, filters: payload_filters },
        limit: count,
        label: 'work_schedules()'
    });

    let { items: work_schedule_rules } = await fetch_combined({
        url: base + '/common-dictionaries/work-schedule-rules/combined?',
        api_key: api_key,
        cursor: cursor,
        body: { page: 1, filters: {} },
        limit: count,
        label: 'work_schedule_rules()'
    });

    try {
        output.total = total; output.ok = ok; output.error = error; output.truncated = truncated;
        work_schedules.forEach((a) => {
            a.id = a.schedule_id;
            let rules = work_schedule_rules.filter(wsr => wsr.schedule_id === a.schedule_id);
            a.rules = {
                'by_day': {},
                'list': []
            };
            rules.forEach((r) => {
                a.rules.list.push(r);
                a.rules.by_day[r.day_of_week] = a.rules.by_day[r.day_of_week] || [];
                a.rules.by_day[r.day_of_week].push(r);
            });

            output.list.push(a);
            output.by_id[a.schedule_id] = output.by_id[a.schedule_id] || a;
            if (a.schedule_name) output.by_name[a.schedule_name] = output.by_name[a.schedule_name] || a;
            if (a.schedule_code) output.by_code[a.schedule_code] = output.by_code[a.schedule_code] || a;
        });

    } catch (e) {console.error(e.stack)}

    //group({ name: `WORK SCHEDULES (${env}:${api_key})`, data: output.list, criteries: 'name' });
    return output;
}
const schedules = work_schedules;

const skills = makeListHelper({
    entity: 'skills',
    endpoint: '/skill-management/combined?',
    idField: 'skill_id',
    nameField: 'name',
    filterKey: 'skill_ids'
});

const facilities = makeListHelper({
    entity: 'facilities',
    endpoint: '/facilities/list?',
    idField: 'facility_id',
    filterKey: 'facility_ids',
    baseFilters: { status: [1, 2] },
    orderBy: [["facility_alias", "desc"]],
    init: () => ({ by_uuid: {}, by_alias: {}, by_facility_alias: {}, by_address: {}, by_status: { active: [], archived: [] } }),
    transform: (a, o) => {
        let status = a.status === 1 ? 'active' : 'archived';
        if (a.facility_uuid) o.by_uuid[a.facility_uuid] = o.by_uuid[a.facility_uuid] || a;
        if (a.address) o.by_address[a.address] = o.by_address[a.address] || a;
        if (a.facility_alias) {
            o.by_alias[a.facility_alias] = o.by_alias[a.facility_alias] || a;
            o.by_facility_alias[a.facility_alias] = o.by_facility_alias[a.facility_alias] || a;
            o.by_name[a.facility_alias] = o.by_name[a.facility_alias] || a;
        }
        o.by_status[status].push(a);
    }
});

// regions/ fields confirmed live: region_id, region_type_id, parent_region_id, name, is_active, created_at, ...
// region_types fields still assumed (region_type_id/name/is_system) — adjust once a response is confirmed.
const region_types = async ({ api_key=null, env=null, search_query=null, ids=null, id=null, is_active=true, is_system=null, page=1, cursor=false, filters=null, count=500 } = {}) => {
    let isPROD = resolveEnv(env);
    api_key = await resolveApiKey(api_key, env);

    let output = {
        'by_id': {},
        'by_name': {},
        'by_code': {},
        'by_type': { 'system': [], 'custom': [] },
        'list': []
    };

    let payload_filters = {};
    if (is_active != null) payload_filters.is_active = is_active;
    if (is_system != null) payload_filters.is_system = is_system;
    if (search_query) payload_filters.search_query = search_query;
    ids = ids || id;
    if (ids) payload_filters.region_type_ids = ids.split(',').map(i => i.trim()).filter(i => i);
    if (filters) payload_filters = Object.assign(payload_filters, filters);

    let { items, total, ok, error, truncated } = await fetch_combined({
        url: apiBase(isPROD) + '/regions/types/combined?',
        api_key: api_key,
        cursor: cursor,
        body: { page: page, filters: payload_filters },
        limit: count,
        per_page: 100,
        label: 'region_types()'
    });
    output.ok = ok; output.error = error;

    try {
        output.total = total; output.ok = ok; output.error = error; output.truncated = truncated;
        items.forEach((a) => {
            a.id = a.region_type_id ?? a.id;
            output.list.push(a);

            if (a.id != null) output.by_id[a.id] = output.by_id[a.id] || a;
            let name = a.name ?? a.region_type_name;
            if (name) output.by_name[name] = output.by_name[name] || a;
            if (a.code) output.by_code[a.code] = output.by_code[a.code] || a;

            let sys = a.is_system === true || a.is_system === 'Yes' || a.is_system === 1;
            output.by_type[sys ? 'system' : 'custom'].push(a);
        });

    } catch (e) {console.error(e.stack)}

    //group({ name: `REGION TYPES (${env}:${api_key})`, data: output.list, criteries: 'name' });
    return output;
}

const regions = async ({ api_key=null, env=null, search_query=null, ids=null, id=null, is_active=true, system=false, page=1, cursor=false, filters=null, count=500 } = {}) => {
    let isPROD = resolveEnv(env);
    api_key = await resolveApiKey(api_key, env);

    let output = {
        'by_id': {},
        'by_name': {},
        'by_type': {},
        'by_type_name': {},
        'by_parent': {},
        'by_depth': {},
        'by_active': { 'yes': [], 'no': [] },
        'list': []
    };

    let payload_filters = {};
    if (is_active != null) payload_filters.is_active = is_active;
    if (search_query) payload_filters.search_query = search_query;
    ids = ids || id;
    if (ids) payload_filters.region_ids = ids.split(',').map(i => i.trim()).filter(i => i);
    if (filters) payload_filters = Object.assign(payload_filters, filters);

    let { items, total, ok, error, truncated } = await fetch_combined({
        url: apiBase(isPROD)
        + (system ? '/regions/system/combined?' : '/regions/combined?'),   // system:true -> the global system-region catalog
        api_key: api_key,
        cursor: cursor,
        body: { page: page, filters: payload_filters },
        limit: count,
        per_page: 100,
        label: 'regions()'
    });

    // region_type_id -> type name. The /regions/combined rows now carry region_type_name inline, so
    // build the map straight from them — NO extra request in the normal case. Only if some row is
    // missing the name do we fall back to a region_types() lookup (id matched BY VALUE, key-agnostic).
    let typeNameById = {};
    items.forEach(a => { if (a.region_type_id != null && a.region_type_name != null) typeNameById[a.region_type_id] = a.region_type_name; });

    let needLookup = items.some(a => a.region_type_id != null && a.region_type_name == null);
    if (needLookup) try {
        let usedTypeIds = new Set(items.map(a => a.region_type_id).filter(v => v != null));
        let nameOf = (t) => t.name ?? t.region_type_name ?? t.type_name ?? t.title ?? t.label ?? t.display_name;
        let idOf = (t) => {
            let id = t.region_type_id ?? t.id ?? t.type_id ?? t.uuid;
            if (id != null && usedTypeIds.has(id)) return id;
            for (let v of Object.values(t)) if (typeof v === 'string' && usedTypeIds.has(v)) return v; // match by value
            return id;
        };

        let typeRows = [];
        let attempts = [
            { is_active: true, is_system: null },   // all active types (system + custom) — one request in the normal case
            { is_active: null, is_system: null }    // safety net: every type, only if the above returned nothing
        ];
        for (let f of attempts) {
            let types = await region_types({ api_key: api_key, env: env, is_active: f.is_active, is_system: f.is_system, count: 500 });
            typeRows = types.list || [];
            typeRows.forEach(t => {
                let tid = idOf(t), tname = nameOf(t);
                if (tid != null && tname != null && typeNameById[tid] == null) typeNameById[tid] = tname;
            });
            if (Object.keys(typeNameById).length > 0) break;
        }
        if (Object.keys(typeNameById).length === 0) {
            console.warn('regions(): could not map region types. rows=' + typeRows.length +
                ' sample=' + JSON.stringify(typeRows[0]) +
                ' usedTypeIds=' + JSON.stringify([...usedTypeIds].slice(0, 3)));
        }
    } catch (e) { console.error('regions() region_types lookup failed: ' + e.stack); }

    try {
        output.total = total; output.ok = ok; output.error = error; output.truncated = truncated;
        let idField = system ? 'system_region_id' : 'region_id';   // system regions key on system_region_id
        items.forEach((a) => {
            a.id = a[idField];
            output.list.push(a);

            output.by_id[a.id] = output.by_id[a.id] || a;
            if (a.name) output.by_name[a.name] = output.by_name[a.name] || a;

            if (a.region_type_id) {
                output.by_type[a.region_type_id] = output.by_type[a.region_type_id] || [];
                output.by_type[a.region_type_id].push(a);

                let tname = a.region_type_name ?? typeNameById[a.region_type_id];
                if (tname) {
                    a.region_type_name = tname;
                    output.by_type_name[tname] = output.by_type_name[tname] || [];
                    output.by_type_name[tname].push(a);
                }
            }
            if (a.parent_region_id) {
                output.by_parent[a.parent_region_id] = output.by_parent[a.parent_region_id] || [];
                output.by_parent[a.parent_region_id].push(a);
            }
            // depth: explicit field if present, else derived from the hierarchy `path` ("/root/.../self/" -> segments-1)
            let depth = a.depth;
            if (depth == null && typeof a.path === 'string') {
                let segs = a.path.split('/').filter(Boolean);
                if (segs.length) depth = segs.length - 1;
            }
            if (depth != null) {
                a.depth = depth;
                output.by_depth[depth] = output.by_depth[depth] || [];
                output.by_depth[depth].push(a);
            }
            output.by_active[a.is_active ? 'yes' : 'no'].push(a);
        });

    } catch (e) {console.error(e.stack)}

    //group({ name: `REGIONS (${env}:${api_key})`, data: output.list, criteries: 'name' });
    return output;
}

// avoidance zones and territories share the same territory_* shape; only the endpoint differs.
const _territoryTransform = (a, o) => {
    if (a.territory_uuid) o.by_uuid[a.territory_uuid] = o.by_uuid[a.territory_uuid] || a;
    if (a.territory_name) o.by_territory_name[a.territory_name] = o.by_territory_name[a.territory_name] || a;
    if (a.territory_type) {
        o.by_type[a.territory_type] = o.by_type[a.territory_type] || [];
        o.by_type[a.territory_type].push(a);
    }
};

const avoidence_zones = makeListHelper({
    entity: 'avoidence_zones',
    endpoint: '/avoidance/list/combined?',
    idField: 'territory_id',
    nameField: 'territory_name',
    filterKey: 'territory_ids',
    orderBy: [],
    init: () => ({ by_uuid: {}, by_territory_name: {}, by_type: {} }),
    transform: _territoryTransform
});

const territories = makeListHelper({
    entity: 'territories',
    endpoint: '/territories/list/combined?',
    idField: 'territory_id',
    nameField: 'territory_name',
    filterKey: 'territory_ids',
    orderBy: [],
    init: () => ({ by_uuid: {}, by_territory_name: {}, by_type: {} }),
    transform: _territoryTransform
});

const route = async ({ api_key=null, env=null, route_id=null } = {}) => {
    let isPROD = resolveEnv(env);    
    api_key = await resolveApiKey(api_key, env);
    if (!route_id) route_id = query.route_id;
    if (!route_id || route_id == '') console.error('route() route_id is empty')
    
    let output = await request({
        url: (isPROD ?  'https://api.route4me.com/api.v4' : 'https://api.routeml.com/api.v4')
            + '/route.php?'
            + `&route_id=${route_id}`
            + '&directions=1'
            + '&device_tracking_history=1'
            + '&notes=1'
            + '&order_inventory=true'
            + '&bundling_items=true'
            + '&route_path_output=EncodedList&compress_path_points=1',
        method: 'GET',
        ...v4auth(api_key),
        debug: DEBUG(),
    });
    let notes = Object.fromEntries(output.notes.map(rn => [rn.note_id, rn]));
    let addresses = Object.fromEntries(output.addresses.map(ra => [ra.destination_uuid, ra]));
    output.notes = output.notes.map(rn => {
        rn.destination = addresses[rn.destination_uuid];
        return rn;
    })
    //console.log(`ROUTE ${route_id}`, output);
    return output;
}

const routes = async ({ api_key=null, env=null, search_query=null, ids=null, id=null, page=1, cursor=false, filters=null, mode=null, count=500 } = {}) => {
    let isPROD = resolveEnv(env);
    api_key = await resolveApiKey(api_key, env);

    let output = {
        'by_id': {},
        'by_uuid': {},
        'by_name': {},
        'by_status': {},
        'by_user_id': {},
        'by_vehicle_id': {},
        'list': []
    };

    let payload_filters = {
        "prev_view_mode": "recently_created"
    };
    if (search_query) payload_filters.search_query = search_query;
    let id_list = (ids || id || '').split(',').map(r => r.trim()).filter(r => r);
    if (id_list.length > 0) payload_filters.route_ids = id_list;
    if (filters) payload_filters = Object.assign(payload_filters, filters);

    let { items, total, ok, error, truncated } = await fetch_combined({
        url: apiBase(isPROD)
        + '/routes/list/combined?',
        api_key: api_key,
        cursor: cursor,
        body: {
            page: page,
            filters: payload_filters,
            fields: [],
            initial_request: false,
            order_by: [["created_timestamp", "desc"]],
            group_by: "none"
        },
        limit: count,
        label: 'routes()'
    });

    try {
        if (mode === 'full') {
            // fetch per-route details in parallel (bounded) instead of one-at-a-time
            await pmap(items, async (it) => {
                it.route_details = await route({ api_key: api_key, env: env, route_id: it.route_id });
            }, 5);
        }

        output.total = total; output.ok = ok; output.error = error; output.truncated = truncated;
        items.forEach((a) => {
            a.id = a.route_id;
            output.list.push(a);

            output.by_id[a.route_id] = output.by_id[a.route_id] || a;
            if (a.route_uuid) output.by_uuid[a.route_uuid] = output.by_uuid[a.route_uuid] || a;
            if (a.route_name) output.by_name[a.route_name] = output.by_name[a.route_name] || a;
            if (a.route_status) {
                output.by_status[a.route_status] = output.by_status[a.route_status] || [];
                output.by_status[a.route_status].push(a);
            }
            if (a.member_id) {
                output.by_user_id[a.member_id] = output.by_user_id[a.member_id] || [];
                output.by_user_id[a.member_id].push(a);
            }
            if (a.vehicle_id) {
                output.by_vehicle_id[a.vehicle_id] = output.by_vehicle_id[a.vehicle_id] || [];
                output.by_vehicle_id[a.vehicle_id].push(a);
            }
        });

    } catch (e) {console.error(e.stack)}

    //group({ name: `ROUTES (${env}:${api_key})`, data: output.list, criteries: 'route_id' });
    return output;
}

const destinations = async ({ api_key=null, env=null, search_query=null, ids=null, id=null, route_ids=null, route_id=null, depot=true, unrouted=false, page=1, cursor=false, filters=null, count=500 } = {}) => {
    let isPROD = resolveEnv(env);
    api_key = await resolveApiKey(api_key, env);

    let output = {
        'by_id': {},
        'by_uuid': {},
        'by_address': {},
        'by_name': {},
        'by_route_id': {},
        'by_route_name': {},
        'by_sequence_no': {},
        'by_depot': {'yes': [], 'no': []},
        'by_order_id': {},
        'list': []
    };

    let payload_filters = {};
    if (search_query) payload_filters.search_query = search_query;
    route_ids = route_ids || route_id || '';
    if (route_ids) payload_filters.route_id = route_ids.split(',').map(r => r.trim()).filter(r => r);
    let raw_ids = (ids || id || '').split(',').map(r => r.trim()).filter(r => r);
    let destination_uuids = raw_ids.filter(r => r?.match(/\w{32}/));
    let route_destination_ids = raw_ids.filter(r => r?.match(/^\d+$/));
    if (route_destination_ids.length > 0) payload_filters.route_destination_id = route_destination_ids;
    if (destination_uuids.length > 0) payload_filters.destination_uuid = destination_uuids;
    if (filters) payload_filters = Object.assign(payload_filters, filters);

    let { items, total, ok, error, truncated } = await fetch_combined({
        url: apiBase(isPROD)
        + '/route-destinations/list/combined?',
        api_key: api_key,
        cursor: cursor,
        body: {
            page: page,
            filters: payload_filters,
            fields: ["is_depot", "sequence_no"],
            initial_request: false,
            order_by: [["destination_name", "desc"]],
            group_by: "route"
        },
        limit: count,
        label: 'destinations()'
    });

    try {
        items = items
            .filter(d => depot === false ? d.is_depot == 'No' : true)
            .filter(d => unrouted === false ? !d.route_name?.match(/unrouted/i) : true);

        output.total = total; output.ok = ok; output.error = error; output.truncated = truncated;
        items.forEach((a) => {
            a.id = a.route_destination_id;
            output.list.push(a);

            output.by_id[a.route_destination_id] = output.by_id[a.route_destination_id] || a;
            if (a.destination_uuid) output.by_uuid[a.destination_uuid] = output.by_uuid[a.destination_uuid] || a;
            if (a.destination_name) {
                output.by_name[a.destination_name] = output.by_name[a.destination_name] || a;
                output.by_address[a.destination_name] = output.by_address[a.destination_name] || a;
            }
            if (a.route_id) {
                output.by_route_id[a.route_id] = output.by_route_id[a.route_id] || [];
                output.by_route_id[a.route_id].push(a);
            }
            if (a.route_name) {
                output.by_route_name[a.route_name] = output.by_route_name[a.route_name] || [];
                output.by_route_name[a.route_name].push(a);
            }
            if (a.sequence_no != null) output.by_sequence_no[a.sequence_no] = output.by_sequence_no[a.sequence_no] || a;
            output.by_depot[a.is_depot == 'Yes' ? 'yes' : 'no'].push(a);
            if (a.order_id) output.by_order_id[a.order_id] = output.by_order_id[a.order_id] || a;
        });

    } catch (e) {console.error(e.stack)}

    //group({ name: `DESTINATIONS (${env}:${api_key})`, data: output.list, criteries: 'destination_name' });
    return output;
}

const profile = async ({ api_key=null, env=null, count=500 } = {}) => {
    let isPROD = resolveEnv(env);    
    api_key = await resolveApiKey(api_key, env);
    
    let output = await request({
        url: apiBase(isPROD) + '/profile-api?',
        method: 'GET',
        authtype: 'bearer', 
        apikey: api_key,
    });     
    //console.log(`PROFILE`, output);
    return output;
}

const menu = async ({ api_key=null, env=null, count=500 } = {}) => {
    let isPROD = resolveEnv(env);    
    api_key = await resolveApiKey(api_key, env);
    
    let output = await request({
        url: apiBase(isPROD) + '/internal-menu/generate?',
        method: 'GET',
        authtype: 'bearer', 
        apikey: api_key,
    });     
    //console.log(`PROFILE`, output);
    return output;
}

// --- external links (PROD-aware) ---------------------------------------------------------------
const adminPanelLink = (userid, isPROD) => (isPROD ? 'https://root.routesinc.com' : 'https://root.admin-panel.routeml.com') + '/members/' + userid + '/details/index.html';
const recurlyLink    = (userid, isPROD) => (isPROD ? 'https://route4me.recurly.com/accounts/' : 'https://route4me-staging.recurly.com/accounts/') + userid;
const getAdminPanelLink = (userid) => adminPanelLink(userid, PROD);   // uses request env (query.env)
const getRecurlyLink    = (userid) => recurlyLink(userid, PROD);

// compact single-line display of a value (unquoted keys, like the getInfo output)
const _compact = (v) => {
    if (v === null || v === undefined) return '';
    if (Array.isArray(v)) return '[' + v.map(_compact).join(',') + ']';
    if (typeof v === 'object') return '{' + Object.entries(v).map(([k, x]) => k + ':' + _compact(x)).join(',') + '}';
    return String(v);
};

// cookies + localStorage KEYS for the current domain — pluggable, environment-adaptive STUB.
// Resolves { cookies, localstorage_keys } and ADAPTS to where it runs, so a browser build needs no
// change: reads browser globals (document.cookie / localStorage) when present, else the Postman
// cookie jar (localStorage stays a sandbox note). Override the whole source via setDomainStateReader(fn)
// — fn(url) may return the object (or a Promise of it) for a custom browser/extension context.
let domainStateReader = null;
const setDomainStateReader = (fn) => { domainStateReader = (typeof fn === 'function') ? fn : null; };
// "a=1; b=2" -> {a:'1', b:'2'}. Pairs split on the FIRST '=' only — cookie values may embed '='
// (base64, JWTs); values are url-decoded when possible.
const _parseCookies = (str) => {
    let out = {};
    String(str || '').split(';').forEach(pair => {
        pair = pair.trim();
        if (!pair) return;
        let i = pair.indexOf('=');
        let name = (i === -1 ? pair : pair.slice(0, i)).trim();
        let value = i === -1 ? '' : pair.slice(i + 1).trim();
        try { value = decodeURIComponent(value); } catch (e) {}
        out[name] = value;
    });
    return out;
};
const _domainState = (url) => new Promise((resolve) => {
    if (domainStateReader) {
        try { return Promise.resolve(domainStateReader(url)).then(resolve, () => resolve({ cookies: '(reader error)', localstorage_keys: null })); }
        catch (e) { return resolve({ cookies: '(reader error)', localstorage_keys: null }); }
    }
    let out = { cookies: '(none)', localstorage_keys: null };

    // localStorage — browser: real keys; sandbox: note (no browser storage)
    try {
        let ls = (typeof localStorage !== 'undefined') ? localStorage : ((typeof window !== 'undefined' && window.localStorage) || null);
        out.localstorage_keys = ls ? Object.keys(ls).join(', ') : '(no localStorage in sandbox)';
    } catch (e) { out.localstorage_keys = '(no localStorage in sandbox)'; }

    // cookies — browser: document.cookie; Postman: cookie jar; else note
    try {
        if (typeof document !== 'undefined' && typeof document.cookie === 'string') {
            out.cookies = document.cookie ? _parseCookies(document.cookie) : '(none)';
            return resolve(out);
        }
        let jar = pm.cookies && pm.cookies.jar && pm.cookies.jar();
        if (jar && typeof jar.getAll === 'function' && url) {
            return jar.getAll(url, (err, cookies) => {
                out.cookies = (!err && cookies && cookies.length) ? Object.fromEntries(cookies.map(c => [c.name, c.value])) : (err ? '(' + (err.message || err) + ')' : '(none)');
                resolve(out);
            });
        }
        out.cookies = '(cookie jar unavailable / domain not whitelisted)';
        resolve(out);
    } catch (e) { out.cookies = '(' + (e.message || e) + ')'; resolve(out); }
});

// getInfo({query}) — query every valuable-info endpoint (v5 /profile-api, session validate,
// v4 configuration-settings, magic-login), merge + compute fields (env, profile summary, admin_link,
// recurly_link, magic_link, member_password (defaults to DEFAULT_PASSWORD when no endpoint
// returned one), cookies, localstorage_keys) into one bag, filter the bag's PROPERTY NAMES by the
// '|'-separated regex `query` (no query = everything; there are no always-on keys), and return
// aligned TSV ("key)\tvalue").
const _INFO_ORDER = ['env','member_id','member_email','profile','member_password','admin_link','recurly_link','qa_mode','member_api_key','magic_link','account_type_alias','READONLY_USER','member_type','OWNER_MEMBER_ID','ROOT_OWNER_MEMBER_ID','ROOT_OWNER_MEMBER_EMAIL','ROOT_OWNER_MEMBER_API_KEY','service_type','cookies','localstorage_keys'];
// The standard QA password accounts are provisioned with (see create-account.postman.js).
// getInfo reports it as member_password when no endpoint returned one. NOT hardcoded — set it in a
// collection/environment variable `qa-password` (kept out of source/git). Empty if unset.
const DEFAULT_PASSWORD = (() => { try { return _cvStr('qa-password') || pm.environment.get('qa-password') || ''; } catch (e) { return ''; } })();
const getInfo = async ({ query: q = '', api_key = null, env = null, log = true } = {}) => {
    let isPROD = resolveEnv(env);
    api_key = await resolveApiKey(api_key, env);
    let apiV4 = 'https://api.' + (isPROD ? 'route4me' : 'routeml') + '.com';

    let patterns = String(q).split('|').map(t => t.trim()).filter(Boolean).map(t => {
        try { return new RegExp(t, 'i'); } catch (e) { return new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); }
    });
    let match = (k) => !patterns.length || patterns.some(re => re.test(k));

    let wantMagic = !patterns.length || match('magic_link') || match('magic');   // magic mints a login link -> only when asked
    let [profile, session, config, magic] = await Promise.all([
        request({ url: apiBase(isPROD) + '/profile-api?', method: 'GET', authtype: 'bearer', apikey: api_key, debug: DEBUG() }).catch(() => null),
        request({ url: apiV4 + '/datafeed/session/validate_session.php', method: 'GET', ...v4auth(api_key), debug: DEBUG() }).catch(() => null),
        request({ url: apiV4 + '/api.v4/configuration-settings.php', method: 'GET', ...v4auth(api_key), debug: DEBUG() }).catch(() => null),
        wantMagic ? request({ url: apiBase(isPROD) + '/magic-login/create', method: 'POST', authtype: 'bearer', apikey: api_key, debug: DEBUG() }).catch(() => null) : Promise.resolve(null),
    ]);

    // merge raw top-level fields from each source, then compute/alias
    let bag = {};
    [profile, session, config].forEach(r => { if (r && typeof r === 'object' && !Array.isArray(r)) Object.assign(bag, r); });

    bag.env = isPROD ? 'PROD' : 'STAGING';
    if (profile && typeof profile === 'object') {
        bag.profile = {};
        ['member_id','root_member_id','distance_units','timezone','currency_code','preferred_fuel_consumption_units','measurement_system']
            .forEach(k => { if (profile[k] !== undefined) bag.profile[k] = profile[k]; });
    }
    if (bag.password != null && bag.member_password == null) { bag.member_password = bag.password; delete bag.password; }
    if (bag.member_password == null) bag.member_password = DEFAULT_PASSWORD;   // standard QA account password
    let memberId = bag.member_id ?? bag.MEMBER_ID ?? (profile && profile.member_id);
    if (memberId != null) { bag.admin_link = adminPanelLink(memberId, isPROD); bag.recurly_link = recurlyLink(memberId, isPROD); }
    if (magic) bag.magic_link = magic.link || magic.magic_link || magic.url || null;

    // cookies/localstorage_keys respect the query filter like everything else — only read the
    // domain state when they'd be shown (no query, or the query matches them)
    if (!patterns.length || match('cookies') || match('localstorage_keys')) {
        let dom = await _domainState(pm.collectionVariables.get('baseUrl') || apiBase(isPROD));
        bag.cookies = dom.cookies; bag.localstorage_keys = dom.localstorage_keys;
    }

    // filter purely by property name: every gathered key must match the query (no query = all)
    let keep = Object.keys(bag).filter(match);
    keep.sort((a, b) => {
        let ia = _INFO_ORDER.indexOf(a), ib = _INFO_ORDER.indexOf(b);
        if (ia === -1 && ib === -1) return a.localeCompare(b);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });

    let tsv = keep.map(k => k + ')\t' + (bag[k] && typeof bag[k] === 'object' ? _compact(bag[k]) : (bag[k] == null ? '' : String(bag[k])))).join('\n');
    if (log) console.info(tsv);
    return tsv;
};

const now = () => {
    const timestamp = parseInt(Date.now() / 1000);
    pm.globals.set("now", timestamp);
    return timestamp;
}

const wait = async ({ time = 0, reason = null, count=500 } = {}) => {
    await new Promise(resolve => {
        time = time || 0;
        reason ? console.log('wait ' + reason, time / 1000 + 's') : '';
        return setTimeout(resolve, time);
    })
}

const string = ({
    length = 10,
    config = {
        latin: true,
        cyrillic: false,
        farsi: false,
        arabic: false,
        umlauts: false,
        emojis: false,
        nameSpecials: false,
        specials: false,
        numbers: true,
        space: false
    },
    debug = false,
    allCapital = true,
    sliceLength = 10, 
    sliceSeparator = "" 
} = {}) => {

    if (!length) length = 10
    if (!config) config = {
        latin: true,
        cyrillic: false,
        farsi: false,
        arabic: false,
        umlauts: false,
        emojis: false,
        nameSpecials: false,
        specials: false,
        numbers: true,
        space: false
    }
    // Helper function to solve for the marker's cumulative length.
    // It solves the equation: x = baseLength + 2 (for the dots) + length of x itself.
    const solveCumulativeLength = (baseLength) => {
        let x = baseLength + 3; // Initial guess assumes the marker's number is 1 digit.
        for (let i = 0; i < 5; i++) {
            const markerNumberLength = x.toString().length;
            const newX = baseLength + 2 + markerNumberLength;
            if (newX === x) return x; 
            x = newX;
        }
        return x;
    };

    // --- 1. Pre-calculation Phase ---
    const markers = [];
    let totalRandomCharsCount = 0;
    let currentLength = 0;

    if (sliceLength > 0) {
        while (true) {
            // Base length now includes the current length, the random slice, AND the separator
            const baseForSolver = currentLength + sliceLength + sliceSeparator.length;
            const nextCumulativeLength = solveCumulativeLength(baseForSolver);
            const marker = `${nextCumulativeLength}`;

            // If adding slice + separator + marker exceeds total length, stop.
            if (currentLength + sliceLength + sliceSeparator.length + marker.length > length) {
                break;
            }

            markers.push(marker);
            totalRandomCharsCount += sliceLength;
            
            // Update current length including the separator and marker
            currentLength += sliceLength + sliceSeparator.length + marker.length;
        }
    }
    
    // Add the remaining space to the character count.
    const remainingCharsCount = length - currentLength;
    totalRandomCharsCount += remainingCharsCount;

    if (totalRandomCharsCount < 0) {
        if (debug) console.error(`Error: The requested length ${length} is too short.`);
        return "";
    }

    // --- 2. Generation Phase ---
    const addSlice = (characterSet, len) => {
        let output = [];
        const symbols = characterSet.split('');
        if (symbols.length === 0) return [];
        for (let i = 0; i < len; i++) {
            output.push(symbols[~~(Math.random() * symbols.length)]);
        }
        return output;
    };

    let charArray = [];
    const distribution = Object.entries(config).filter(([, value]) => value);

    if (distribution.length === 0 && totalRandomCharsCount > 0) {
        if (debug) console.error("Error: No character sets are enabled in the config.");
        return "";
    }

    const equalLength = distribution.length > 0 ? Math.floor(totalRandomCharsCount / distribution.length) : 0;
    const equalLengthRest = distribution.length > 0 ? totalRandomCharsCount % distribution.length : 0;
    
    if (config.latin) charArray = charArray.concat(addSlice("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", equalLength));
    if (config.cyrillic) charArray = charArray.concat(addSlice("абвгдеёжзийклмнопрстуфхцчшщъыьэюяАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ", equalLength));
    if (config.farsi) charArray = charArray.concat(addSlice("آابپتثجچحخدذرزژسشصضطظعغفقکگلمینو", equalLength));
    if (config.umlauts) charArray = charArray.concat(addSlice("àèìòùÀÈÌÒÙáéíóúýÁÉÍÓÚÝðÐâêîôûÂÊÎÔÛãñõÃÑÕäëïöüÿÄËÏÖÜŸåÅæÆœŒßçÇøØ¢¿¡€", equalLength));
    if (config.arabic) charArray = charArray.concat(addSlice("ءاأإءؤئـئآاًةابتثج‌حخدذرزس‌شصضطظعغفقكلمنهوي", equalLength));
    if (config.emojis) charArray = charArray.concat(addSlice("🤯👍🦊🐍🍎⚽️🗿⚠️💯🏳️‍🌈", equalLength));
    if (config.specials) charArray = charArray.concat(addSlice('\\|/!@#$%^*_+={}[];:<>?~`', equalLength));
    if (config.nameSpecials) charArray = charArray.concat(addSlice("&-()\"',.", equalLength));
    if (config.numbers) charArray = charArray.concat(addSlice('1234567890', equalLength));
    if (config.space) charArray = charArray.concat(addSlice(' ', equalLength));

    let randomPart = charArray
        .concat(addSlice(charArray.join(''), equalLengthRest))
        .sort(() => Math.random() - 0.5)
        .join('');
        
    if (allCapital) {
        randomPart = randomPart.toUpperCase();
    }
    
    // --- 3. Assembly Phase ---
    const result = [];
    let randomSliceStart = 0;
    
    for (const marker of markers) {
        // 1. Add the random characters
        result.push(randomPart.substring(randomSliceStart, randomSliceStart + sliceLength));
        // 2. Add the separator
        result.push(sliceSeparator);
        // 3. Add the cumulative marker
        result.push(marker);
        
        randomSliceStart += sliceLength;
    }
    
    // Add the final remaining characters.
    result.push(randomPart.substring(randomSliceStart));
    
    return result.join('');
};

function csv({ data, separator = ',', escape = '"', wrap = ['', ''], end = '\n', headers = null, count=500 } = {}) {
    if (typeof headers === 'string' && headers.length > 0) {
        //console.log('headers', headers);
        headers = headers.split(',').map(h => h.trim());
    }
    if (!headers) headers = [];
    let d = [];

    data = JSON.parse(JSON.stringify(data))

    switch (typeof data) {
        case 'object':
            if (Array.isArray(data)) {
                d = data;
                break;
            } else {
                d = Object.values(data);
                break;
            }
        case 'string':
            d = data.split(separator);
            break;
        default:
            return false;
    }
    while ((!d[0] || d[0]==='') && d.length>0) {
        d.shift();
    }

    if (wrap.length < 2) {
        wrap = wrap.split('');
        if (wrap.length < 2) {
            wrap.splice(0, 0, '');
        }
    }

    let csv = "";
    let keys = (d[0] && Object.keys(d[0])) || [];
    if (headers.length == 0) {
        // header set = UNION of every row's keys, so a column present only in later rows isn't dropped
        let seen = new Set();
        for (let row of d) if (row && typeof row === 'object') for (let k of Object.keys(row)) seen.add(k);
        headers = seen.size ? [...seen] : keys;
    }
    csv += wrap[0] + escape + headers.map(h => h.replaceAll(new RegExp(/\"/g), '\"').replaceAll(new RegExp(/\'/g), "\'")).join(escape + separator + escape) + escape + wrap[1] + end;
    for (let line of d) {
        // map values by HEADERS (not the first row's keys) so every column aligns; missing -> empty cell
        let formattedLine = headers.map(key => {
            if (line[key] !== undefined) {
                //console.log(typeof line[key])
                //console.log(line[key])
                if (line[key] === true) line[key] = 'true'
                if (line[key] === false) line[key] = 'false'
                if (line[key] === null) line[key] = 'null'
                if (typeof line[key] === 'object') line[key] = JSON.stringify(line[key])
                line[key] = line[key]
                .toString()
                .replaceAll(new RegExp(/\\"/g), "'") // Replace escaped double quotes
                .replaceAll(new RegExp(/\\'/g), "'") // Replace escaped double quotes
                .replaceAll(new RegExp(/\"/g), "'")  // Replace remaining double quotes
                .replaceAll(new RegExp('\r\n|\r|\n', 'g'), ' ') // Replace newlines with spaces
                .replaceAll(new RegExp(/\\/g), "")  // Replace escaped slash
                .replaceAll(new RegExp(/^\'/g), "")  // Replace first single quote
                .replaceAll(new RegExp(/\'$/g), "")  // Replace last single quote
                //.replaceAll(new RegExp('([' + escape + separator + wrap + '])+', 'g'), '$1'); // Remove duplicate special characters
                //console.log(line[key])
            
            }
            return line[key];
        })
        csv += (wrap[0] + escape + formattedLine.join(escape + separator + escape) + escape + wrap[1] + end);
    }
    return csv;
};

const clearCookies = (domain) => { pm.cookies?.jar().clear(domain); };
clearCookies('route4me.com');
clearCookies('routeml.com');
clearCookies('wh.route4me.com');
clearCookies('wh-staging-yx2ian2bajaskas.routeml.com');

const page = (domain) => { return new Promise((resolve, reject) => {            
    pm.sendRequest({
        url: domain,
        method: 'GET',
        header: {
            'Accept': 'text/html',
            'X_R4M_TEST_ID': 'alexs@route4me.com'
        },   
    }, (err, resp) => {
        if (err) {
            reject('Error ' + err.text());
            return;
        } else { 
            resolve(resp.text()); 
        }
    });
})};

// Clear BOTH auth collection vars (api_key + token). NOT called on request start — {{token}} is
// preserved so a manually-set token (required for prod member auth) survives. Call this yourself
// in the post-request script when you want the next run to re-authenticate from scratch.
const clearAuth = () => { pm.collectionVariables.unset('api_key'); pm.collectionVariables.unset('token'); };

// endpoint() — configure baseUrl and establish auth in the single {{token}} var. ASYNC, so `await` it.
// {{token}} is NEVER cleared here. Rules:
//   api_key (param/query)      -> validate {{token}} contains the api_key (fix if it differs)
//   member_id on STAGING       -> reuse {{token}}, else mint token()
//   member_id on PROD          -> {{token}} must be pre-set manually; token() is NOT requested
//   no member_id, {{token}} set -> look up /profile-api and print the member_id it belongs to
const endpoint = async (params) => {
    let baseUrl,
        api_key,
        member_id;
    pm.request.headers.upsert({
        key: 'X_R4M_TEST_ID',
        value: 'alexs@route4me.com'
    });
    if (typeof params === 'object') {
        baseUrl = params.baseUrl;
        api_key = asBearer(params.api_key);
        member_id = params.member_id;
    } else {
        baseUrl = params;                    // endpoint('https://...') — baseUrl only
    }
    // resolve creds from query/header regardless of how baseUrl was passed (string or object)
    api_key = api_key || query.api_key;                        // param (token-obj -> access_token) else query.api_key
    member_id = member_id || cfg('member_id');                 // param else header/query member_id
    if (baseUrl) pm.collectionVariables.set("baseUrl", baseUrl);
    else throw new Error('MISSING baseUrl');

    let cached = _cvStr('token');

    // api_key auth -> ensure {{token}} contains the api_key
    if (api_key) {
        if (cached !== api_key) pm.collectionVariables.set('token', api_key);
        return;
    }
    if (member_id) {
        pm.collectionVariables.set('member_id', member_id);
        if (PROD) {   // prod: never mint — a manually pre-set {{token}} is required
            if (!cached) console.warn('endpoint(): member_id auth on PROD requires {{token}} to be pre-set — token() is not requested on prod');
            return;
        }
        if (!cached) {   // staging: mint only when {{token}} is empty
            let bearer = asBearer(await token({ env: query.env, member_id: member_id }));
            if (bearer) pm.collectionVariables.set('token', bearer);
        }
        return;
    }
    if (cached) await _announceMember(cached, query.env);   // bare token -> report whose it is
};

const variable = (variable, value, plain = false) => {
    if (typeof value === 'object') {
        return pm.collectionVariables.set(variable, JSON.stringify(value));
    } else {
        return pm.collectionVariables.set(variable, value);
    }
}
const payload = variable;

const geocode = async ({env: env, addresses: addresses, api_key: api_key} = {}) => {
    let isPROD = resolveEnv(env);    
    api_key = await resolveApiKey(api_key, env);
    if (addresses.length == 0) throw new Error('geocode() no addresses');

    let payload = {
        "addresses": addresses
    };

    let geocode = await request({
        url: apiBase(isPROD) + '/geocoding/bulk',
            method: 'POST',
        method: 'POST',
        authtype: 'bearer', 
        apikey: api_key,
        body: payload
    });    
    geocode = geocode.map(a => {
        return {
            'address': a.address,
            'lat': a.lat,
            'lng': a.lng
        };
    });

    return geocode;
};

// Google Maps Geocoding key. Resolution order: per-call `key` -> GOOGLE_API_KEY constant ->
// Vault GOOGLE_MAPS_VAULT_KEY. Set GOOGLE_API_KEY here to hardcode, or leave null to use Vault.
let GOOGLE_API_KEY = null;
const GOOGLE_MAPS_VAULT_KEY = 'google-maps';

// Geocode an address via the Google Geocoding API and return its bounding box as
//   { top, left, bottom, right }   (top/bottom = N/S latitude, left/right = W/E longitude)
// Uses geometry.bounds (actual extent), falling back to geometry.viewport for point results.
// Call: bounding_box('Knoxville, TN')  or  bounding_box({ address, key, round: 3 })
const bounding_box = async (opts = {}) => {
    if (typeof opts === 'string') opts = { address: opts };
    let { address = null, key = null, round = null } = opts;

    if (!address) { console.error('bounding_box(): no address'); return null; }
    key = key || GOOGLE_API_KEY || await vault(GOOGLE_MAPS_VAULT_KEY);
    if (!key) { console.error('bounding_box(): no Google API key (pass `key`, set GOOGLE_API_KEY, or Vault "' + GOOGLE_MAPS_VAULT_KEY + '")'); return null; }

    let res = await request({
        url: 'https://maps.googleapis.com/maps/api/geocode/json?address=' + encodeURIComponent(address) + '&key=' + encodeURIComponent(key),
        method: 'GET',
        authtype: 'none'
    });

    if (!res || res.status !== 'OK' || !res.results || !res.results.length) {
        console.error('bounding_box(): geocode failed for "' + address + '" — ' + ((res && res.status) || 'no response') + ((res && res.error_message) ? ' (' + res.error_message + ')' : ''));
        return null;
    }

    let g = res.results[0].geometry || {};
    let box = g.bounds || g.viewport;   // bounds = actual extent (preferred); viewport = fallback for points
    if (!box || !box.northeast || !box.southwest) { console.error('bounding_box(): no bounds/viewport in geometry'); return null; }

    let r = (v) => (round != null ? Number(Number(v).toFixed(round)) : v);
    return {
        top: r(box.northeast.lat),
        left: r(box.southwest.lng),
        bottom: r(box.southwest.lat),
        right: r(box.northeast.lng)
    };
};

const visualize = (data) => {
    const template = `<html><head><script src=" https://cdn.jsdelivr.net/npm/json-tree-viewer@0.0.2/libs/jsonTree/jsonTree.min.js "></script>
    <link href=" https://cdn.jsdelivr.net/npm/json-tree-viewer@0.0.2/libs/jsonTree/jsonTree.min.css " rel="stylesheet"><head>
                <body>
                    <script type="text/javascript">
                        pm.getData( function(err, payload) {
                            Object.entries(payload.data).forEach(([dataChunkKey, dataChunkValue], i) => {
                                let d = document.createElement('div');
                                d.innerHTML += '<h5>'+dataChunkKey+'</h5><div id=v'+i+'></div>'; 
                                document.getElementsByTagName("body")[0].appendChild(d);
                                let wrapper = document.getElementById('v'+i);
                                console.log('dataChunkKey',dataChunkKey)
                                try {
                                    jsonTree.create(dataChunkValue, wrapper);
                                } catch (e) {
                                } finally {}            
                            })                                                                   
                        });
                    </script>
                </body>
            </html>`;

    pm.visualizer.set(template, { data: data });
};

const vehicle = () => {
    return {
        fuel: _.sample([
            "unleaded 87",
            "unleaded 89",
            "unleaded 91",
            "unleaded 93",
            "diesel",
            "electric",
            "hybrid"
        ]),
        type: _.sample([
            "coupe",
            "van",
            "sedan"
        ]),
    };
}    

const requires = (params) => {
    params = params.split(',').map(p => p.trim()).filter(p => p !== '');
    //console.info('Required params:', params.join(','));
    params.forEach(p => {
        if (!query[p]) throw new Error('MISSING ' + p);
    });
}

const jiraCreds = async () => {
    let jiraAPIKEY = await pm.vault.get('jira');
    return btoa(`alexs@route4me.com:${jiraAPIKEY}`)
}

const assignColors = (values, basecolor = { h: 30, s: 150, l: 40 }) => {
    if (typeof values === 'object' && values !== null && !Array.isArray(values)) values = Object.keys(values);
    if (typeof values === 'number') values = Array(values).fill(0).map((k, i) => i);
    const rotateHue = rotation => ({ h, ...rest }) => {
        const modulo = (x, n) => (x % n + n) % n;
        const newHue = modulo(h + rotation, 360);
        return { ...rest, h: newHue };
    }
    return Object.fromEntries(
        values.map((k, i) => {
            let v = {};
            v.color = rotateHue((360 / values.length) * i)(basecolor);
            return [k, v];
        })
    );
};

/**
 * Generates random intervals.
 * @param {number} lowerBound - Minimum value.
 * @param {number} upperBound - Maximum value.
 * @param {number} intervalCount - Number of intervals.
 * @param {boolean} [allowGaps=false] - If true, intervals are disconnected. If false, they are contiguous (+1 logic).
 */
function intervals(lowerBound, upperBound, intervalCount, allowGaps = false) {
  const pointsNeeded = allowGaps ? (intervalCount * 2) : (intervalCount + 1);
  const rangeSize = upperBound - lowerBound + 1;
  if (pointsNeeded > rangeSize) {
    throw new Error(`Range too small. Need ${pointsNeeded} unique numbers, but range is only ${rangeSize}.`);
  }
  const uniqueNumbers = new Set();
  while (uniqueNumbers.size < pointsNeeded) {
    uniqueNumbers.add(_.random(lowerBound, upperBound));
  }
  const sortedPoints = _.sortBy(Array.from(uniqueNumbers));

  if (allowGaps) {
    return _.chunk(sortedPoints, 2);
  } else {
    const intervals = [];
    
    for (let i = 0; i < intervalCount; i++) {
      const start = (i === 0) ? sortedPoints[i] : sortedPoints[i] + 1;
      const end = sortedPoints[i + 1];
      
      intervals.push([start, end]);
    }
    return intervals;
  }
}

// Fetch a single entity by id through any list helper: one(orders, '123') -> the by_id match.
const one = async (helper, id, extra = {}) => {
    if (id == null) return null;
    let res = await helper({ ids: String(id), count: 1, ...extra });
    return (res && res.by_id && res.by_id[id]) || (res && res.list && res.list[0]) || null;
};
// Non-colliding single-entity convenience getters (order/customer/address/facility are free names;
// route() and vehicle() already exist for their own purposes).
const order = (id, extra = {}) => one(orders, id, extra);
const customer = (id, extra = {}) => one(customers, id, extra);
const address = (id, extra = {}) => one(addresses, id, extra);
const facility = (id, extra = {}) => one(facilities, id, extra);

// Inspect an unknown response shape: logs + returns the field keys of the first item a helper yields.
// Pass { silent: true } as the third arg to suppress the console output.
const describe = async (helper, extra = {}, { silent = false } = {}) => {
    let res = await helper({ count: 1, ...extra });
    let sample = res && res.list && res.list[0];
    let keys = sample && typeof sample === 'object' ? Object.keys(sample) : [];
    if (!silent) console.info('describe:', keys.length ? keys : '(no items / not objects)', '\nsample:', sample);
    return { keys, sample, total: res && res.total, ok: res && res.ok };
};

// Lazy helper accessor — a list helper fires ONLY when its result is first accessed, then memoizes.
//   const data = lazy({ env: 'staging' });
//   if (cond) show(await data.vehicles);   // vehicles() runs only if this branch executes
//   const o = await data.orders;           // orders() runs here, once; re-access reuses the same promise
// Each property name maps to the same-named exported helper, called with `opts`. Intended for the
// list helpers (vehicles/orders/regions/…). Unaccessed properties never make a request.
const lazy = (opts = {}) => {
    let cache = {};
    return new Proxy({}, {
        get(_t, name) {
            if (typeof name !== 'string') return undefined;   // ignore Symbol.* / then (proxy is not thenable)
            if (!(name in cache)) {
                let fn = module.exports[name];
                if (typeof fn !== 'function') return undefined;
                cache[name] = fn(opts);
            }
            return cache[name];
        }
    });
};

module.exports = {
    query,
    lazy,
    path, 
    response, 
    PROD, 
    DEBUG, 
    INCLUDE, 
    jiraCreds, 
    wait, 
    string, 
    csv, 
    clearCookies, 
    page, 
    endpoint, 
    requires, 
    variable, 
    visualize, 
    geocode, 
    payload, 
    now,
    vehicle, 
    group, 
    users, 
    team, 
    crews,
    vehicles, 
    memberTypes, 
    orders, 
    vehicle_profiles, 
    vehicle_capacity_profiles,
    equipment_types, 
    optimization_profiles, 
    releases, 
    features, 
    creds, 
    skills,
    facilities, 
    avoidence_zones, 
    territories, 
    route, 
    workflows,
    addresses, 
    locations,
    destinations, 
    routes, 
    route_relations, 
    contracts, 
    service_types,
    work_schedules,
    schedules,
    profile, 
    request, 
    repeat_for, 
    repeat_until, 
    repeat, 
    wait_for, 
    ratelimit, 
    debounce, 
    rows, 
    customers,
    subscription,
    assignColors,
    menu,
    intervals,
    from,
    setFromAutolog,
    pmap,
    clearResponseCache,
    one,
    order,
    customer,
    address,
    facility,
    describe,
    user_features,
    vault,
    clearFeaturesCache,
    paginate,
    bounding_box,
    pickItems,
    pickTotal,
    pickCursor,
    fetch_combined,
    region_types,
    regions,
    select_facilities,
    break_profiles,
    authenticate,
    assets,
    token,
    clearAuth,
    getInfo,
    getAdminPanelLink,
    getRecurlyLink,
    setDomainStateReader,
    setTimezone,
    validateSchema,
    DEFAULT_PASSWORD
}

