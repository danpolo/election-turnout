# מפת המנדטים · Election Turnout 2026

Installable, dependency-free Hebrew RTL PWA for exploratory 2026 Israel election **turnout and count scenarios**, with six arithmetic coalition combinations. **Not an official result, poll, or statistically validated forecast.**

## Working election-day turnout fallback (27 October 2026)

When no validated same-origin official snapshot exists, **Refresh now** fetches `https://raw.githubusercontent.com/navonyaniv/election-il-2026/main/results.json` (independently operated repository [election-il-2026](https://github.com/navonyaniv/election-il-2026)). This repository publicly republishes timestamped Central Elections Committee **partial polling-station turnout** as `live_towns[localityCode] = [percent, reportingStationCount, timestamp]`. At the time of integration the snapshot included 555 localities and a reported 31.5% national turnout, with file updated 13:14 Israel time. These numbers are dated observations, **not live claims** unless refreshed.

The browser validates an election-day `updated` timestamp, no rehearsal flag, an acceptable stage, and at least 100 matching locality reports. It uses each locality's **2022 registered electorate as a historical synthetic denominator**, applying the percentage from reporting 2026 polling stations. This allows bloc mixing without pretending 2026 electorate counts are known. This conversion is a heuristic and reporting stations are **not a random sample** of each locality. The app labels this fallback and shows a source link; the source is not the CEC's own API. If both the verified official same-origin turnout JSON and the mirror exist, the official file has priority. The displayed turnout model is a model of historical bloc composition weighted by reported turnout, **not a current-vote measurement or statistically validated forecast**.

Both the manual Refresh button and a 2-minute visible-tab auto-refresh attempt a new fetch; the browser also reads the latest main-branch JSON from GitHub Raw to avoid lagging behind GitHub Pages deployments; published mirror snapshots may be older than the polling-station observation times. The repo's `.github/workflows/live.yml` separately tries to ingest data directly from CEC production hosts without trusting unverified endpoints and only writes validated snapshots.

## Live data wiring

The PWA now automatically requests two **same-origin**, versioned data files:

- `data/turnout.json` — turnout per locality, updated from the Central Elections Committee's daytime map at `https://mapvotes.bechirot.gov.il`.
- `data/count.json` — counted votes by locality, from the CEC's production `https://media26.bechirot.gov.il/files/expc.csv`, accepted only for source timestamps **after 22:00 Israel time on 27 October 2026**.

The repository workflow `.github/workflows/live.yml` checks for updates on a **best-effort 15-minute schedule**, plus manual workflow dispatch. GitHub cron execution may be delayed. A browser **↻ עדכן נתונים** button re-fetches currently published data immediately. Data source timestamps, not the user's refresh time, are displayed.

**Important:** direct, machine-readable URLs for the *new daytime turnout map* were not independently verified during development. `scripts/update_live.py` attempts discovery of the CEC map's election catalog and referenced JS assets and attempts candidate JSON feeds, rejecting malformed, sparse, stale or test data. Until a real candidate is found, `data/turnout.json` will not exist and the app will explicitly show **waiting for verified election-day data**. The optional repository variable `TURNOUT_FEED_URL` can be set to a verified URL hosted by `mapvotes.bechirot.gov.il` if auto-discovery fails. This is not a promise that discovery will succeed.

Do not point this at the **test** results domain (`cdn-votes26.bechirot.gov.il`); it has published simulated data. Ingestion restricts production hostnames, rejects pre-election timestamps and rejects tiny fixture-sized datasets. Invalid fetched data must never replace a previously verified file.

## Deployment (new public repository)

Static files require no compilation. Enable **Settings → Pages → Deploy from branch → `main` → `/(root)`**. The public app is expected under `https://danpolo.github.io/election-turnout/` once Pages is enabled; verify it in the Pages settings. The workflow uses the repository's `contents: write` permission. If Actions are disabled or the workflow does not update, open the workflow and use **Run workflow**, then read the logs for the actual source verification failure.

## Model mechanics

- Historical source is the 2022 locality-level normalized Central Elections Committee dataset maintained at [`NitzanSelwyn/Voters-IL`](https://github.com/NitzanSelwyn/Voters-IL/blob/main/public/data/rounds/25.json). All relevant 2022 voting groups are assigned, with special-envelope geographical exclusions documented.
- For a locality with 2026 turnout, multiply its 2022 party votes by **current voters / 2022 voters**. For a locality still missing an update, use the **aggregate current-to-2022 participation ratio of reporting localities**, so missing cities do not disappear from the denominator. This is an assumption, not a same-hour 2022 municipal comparison; geographic turnout rhythms may substantially bias estimates.
- The raw partial-count model scales the party distribution of each counted locality to that locality’s historical votes, without correcting which polling stations within a city have reported. Unseen city counts are omitted; coverage is exposed.
- Bloc seats are allocated by largest-remainder normalization to 120 as **illustrative blocs**, not Israeli Bader-Ofer party-by-party allocation (which depends on electoral thresholds and surplus-vote agreements).
- New hypothetical parties עמך ישראל and המילואימניקים deduct only from the Right/Left blocs, proportionally; if sliders are 1–3 they receive no seats, and their seats are redistributed 50/50 from a proportional reduction of those two blocs. These are custom scenario rules. Real count votes for those lists are deliberately **not** counted twice within the 2026 bloc baseline.
- עוצמה יהודית is estimated as 6/14 of the historical ט list in turnout mode; adjustable with a manual override. In count mode, ballot letter ב is allocated inside Right by its observed share. רע״ם (עם), the Haredi parties (שס/ג), and הדמוקרטים (אמת, 10 seats manually fixed in turnout mode) are internal subsets used for coalition mathematics.
- Six coalition scenarios use `>=61`, with broad coalition excluding `עוצמה יהודית + ש״ס + יהדות התורה + הדמוקרטים`. They indicate arithmetic possibility, **not political willingness**.

## Sources / verification

- Official 2022 locality data: https://data.gov.il/he/datasets/central-election-committee/votes-knesset
- Official 2026 daytime map: https://mapvotes.bechirot.gov.il/
- Official 2026 count portal: https://votes26.bechirot.gov.il/
- Third-party 2026 list/ballot-letter reference (CC BY 4.0): https://github.com/dangelm/bhirot26-election-data (used to verify party identifiers; no source code copied)
- Election-day turnout publication windows: 10:00, 13:00, 17:00, 21:00 by station.

## Tests

`npm test` — deterministic bloc and scenario tests.

`python -m unittest discover -s scripts -p 'test_*.py' -v` — feed parsing and rejection tests.

Run locally with `python -m http.server 8000` and open `http://localhost:8000/`.

## Manual fallback

The settings panel accepts an explicitly configured HTTPS JSON feed or a locally uploaded file. Turnout shape:

```json
{"type":"turnout","timestamp":"2026-10-27T13:00:00+02:00","localities":[{"code":"3000","eligible":500000,"voters":150000}]}
```

Count shape:

```json
{"type":"count","timestamp":"2026-10-27T22:30:00+02:00","localities":[{"code":"3000","parties":{"מחל":3000,"רק":2000}}]}
```

**Examples are schemas only; never present them as actual election data.**