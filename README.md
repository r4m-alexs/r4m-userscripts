# userscript-r4m — standalone browser build (getInfo + listing helpers)

A Violentmonkey/Tampermonkey userscript generated from the single Postman source
(`postman.package.js`). On every Route4Me/RouteML page it injects the helpers into the **page
context** (postload `script#r4m-helpers` node), so the devtools console gets:

- `getInfo({query})` — merged profile / session / config / magic-link info as aligned TSV
- every listing helper (`users`, `vehicles`, `orders`, `addresses`, `routes`, `destinations`,
  `facilities`, `regions`, `workflows`, …) with the normalized `{by_id, by_name, list, total}` shape
- `from(data)` SQL-like builder, `one()/order()/customer()/address()/facility()`, `describe()`
- the full export surface under `window.r4m.*` (bare globals are only promoted when the page
  hasn't claimed the name — collisions are listed in the install log)

## Build & test

```sh
npm run build:userscript    # postman.package.js + browser-bindings.js + page-attach.js -> r4m-helpers.user.js
npm run test:userscript     # offline smoke test (stubbed browser + HTTP, real injection path)
```

No source rewriting: unlike the Insomnia build, the untouched package source runs against a `pm`
shim ([browser-bindings.js](browser-bindings.js)) — `pm.sendRequest` is native `fetch`,
`pm.collectionVariables/globals` are localStorage-backed (`r4m.cv` / `r4m.globals`), and
`require()` resolves lodash/moment to the page's copy when present, else to the bundled Lite
fallbacks.

## Install / deploy

- Install (Violentmonkey/Tampermonkey prompts automatically):
  <https://raw.githubusercontent.com/r4m-alexs/r4m-userscripts/main/r4m-helpers.user.js>
  — the same URL is the `@downloadURL/@updateURL`, so installed copies auto-update on push.
- Local: open `r4m-helpers.user.js` in the browser or drag it into the Violentmonkey dashboard.
- Deploy: `npm run deploy:userscript` — rebuilds, runs the smoke test, then commits and pushes
  this directory (its own git repo) to `github.com/r4m-alexs/r4m-userscripts`. Bump `VERSION`
  in `build-userscript-r4m.js` when publishing a change.
- This repo also hosts the Insomnia bundle (`r4m.bundle.js`, refreshed by the same deploy) —
  `insomnia-r4m/loader.js` fetches it from the raw URL here.

## Auth & config

**Session cookies only — the userscript build never uses a standalone api_key.** Requests go
through `GM_xmlhttpRequest` (extension-level, **not subject to the page's CORS policy**), which
sends the target domain's session cookies from the browser jar — whoever is logged in is who
the helpers act as. `Authorization` / `X-API-KEY` / `SECRET-KEY` headers are stripped at the
transport layer — even an `api_key` argument passed to a helper never leaves the browser.
There is no `r4m.auth()` and no vault: keys and secrets cannot be stored (`{{token}}` is pinned
to a read-only sentinel), so no key material ever lands in page localStorage. The token-auth
exports (`token`, `authenticate`, `clearAuth`, `vault`) are removed from this build entirely —
use Postman/Insomnia for those flows.

`env` is auto-detected from the hostname (`*.routeml.com` → staging, everything else → prod);
`?env=` in the page URL or `r4m.queryOverride('env', 'prod')` overrides (overrides apply on the
next page load — the library reads `query` once at install). Debug curls:
`r4m.queryOverride('debug', 'curl')`.

## Limitations

- Requires a manager with `GM_xmlhttpRequest` (Violentmonkey/Tampermonkey — granted in the
  metadata; Tampermonkey scopes it via `@connect route4me.com/routeml.com/googleapis.com`).
  Without it the code falls back to page `fetch`, which the API's CORS policy will likely block.
- Cookies are per target domain: querying staging from a prod page works only if the browser is
  also logged into staging (and vice versa).
- `read_csv`/`rows` are unavailable (csv-parse isn't bundled); `visualize()`/`.table()` fall back
  to `console.table`.
- moment falls back to a UTC-based Lite shim unless the page ships real moment — timestamps in
  `group()`/`from().enrich()` output are formatted in UTC either way.
