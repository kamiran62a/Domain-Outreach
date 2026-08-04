# برشلونة عبر التاريخ — FC Barcelona Match History

Static site (no build step, no backend) showing FC Barcelona's match results from their first
official match (8 December 1899) to the present, browsable season by season.

## Running locally

```
cd barcelona
python3 -m http.server 8000
```

Then open `http://localhost:8000/`. Opening `index.html` directly via `file://` will break the
`fetch()` calls that load the JSON data in most browsers — always serve it over HTTP.

## Data model and provenance

Every season file under `data/seasons/{id}.json` carries a `"source"` field:

- **`"verified"`** (seasons `2012-13` through `2025-26`): the `matches` array (La Liga +
  Champions League fixtures) is parsed directly from the [openfootball](https://github.com/openfootball)
  open-data project (`openfootball/espana` and `openfootball/champions-league`). Copa del Rey and
  Spanish Super Cup matches are **not** included in any season, even verified ones — no open
  dataset for those competitions was found; see each season's `data_coverage` field. `league_position`
  and `trophies` for these seasons come from well-documented public record, not from the openfootball
  files themselves.
- **`"reconstructed"`** (seasons `1899-00` through `2011-12`): no live or verifiable data source
  exists for this period (general web access is unavailable in the build environment beyond
  GitHub, and no structured dataset covers it). This content was compiled from the model's general
  training knowledge. It is **not a claim of a complete match ledger** — only notable/well-known
  matches are listed (`is_notable: true` throughout), and every such season carries a
  `disclaimer_ar` / `disclaimer_en` string, also shown in the UI, warning that the data may be
  incomplete or contain inaccuracies. Numeric `summary` fields are left `null` wherever they
  weren't confidently known, rather than guessed.

`data/manifest.json` is an aggregated, eagerly-loaded index of all 127 seasons (metadata only, no
match arrays) used to render the season browser instantly. `data/search-index.json` is a flattened,
generated list of every match across every season, used for the opponent search box.

### Regenerating the data

The season JSON files were produced by one-off Python scripts (not checked into this repo) that:
1. Fetch and parse the openfootball `.txt` fixture files for the verified era.
2. Validate every `data/seasons/*.json` file against the shared schema (required keys, valid
   `source` value, filename/`id` match) and regenerate `manifest.json` + `search-index.json` from
   the season files. Re-run this validation after hand-editing any season file.

## Architecture

- `index.html` — single-page shell, `lang="ar" dir="rtl"` by default with an AR/EN toggle.
- `css/style.css` — Barcelona blaugrana theme (blue `#004D98` / garnet `#A50044` / gold `#EDBB00`),
  responsive, light/dark aware.
- `js/i18n.js` — UI string dictionary (Arabic/English).
- `js/data.js` — `fetch()` wrapper with an in-memory cache for the manifest/season/search files.
- `js/render.js` — DOM rendering functions (stats header, season list, season detail, search).
- `js/app.js` — entry point: hash router (`#/season/{id}`), search/filter wiring, language toggle.

This site is fully independent from the rest of this repository (the unrelated cold-email tool in
`app.py` / `static/`) — it is not wired into the Flask app in any way.
