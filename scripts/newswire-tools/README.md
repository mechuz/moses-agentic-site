# Tech Newswire: how it is built and how to change the sources

`/newswire/` on mosesagentic.com lists headlines from the feeds in `scripts/newswire_sources.json`.

The main page, `/newswire/`, is the whole technology sector; each topic has its own page (`/newswire/ai/`, `/newswire/chips/` and so on). `/newswire/technology/`, the old address of the all-technology page, sends visitors to `/newswire/`.

The pages have the front page's look: the header, moving-dot hero, bottom menu and footer come from `scripts/site_shell.py` with `public/vendor/site-shell.css` and `site-shell.js`, shared with Insights and Technology news. Ownership, November 20, 2026: no page on the site should look different from the front page.

The topic order in `TOPICS` must not change: each stored headline records its topics by position in that list. Change the order the chips are shown in, not the list.

| File | What it is |
|---|---|
| `scripts/newswire.py` | The builder. Standard library only. `build` reads every feed; `reuse` re-makes the pages from the items already live. |
| `scripts/newswire_sources.json` | The source list: name, feed address, site address, category. |
| `public/newswire/` | The pages. The deploy workflow rebuilds them; the copy in the repo is only the fallback. |
| `.github/workflows/newswire-clock.yml` | The clock: one always-running job that starts the deploy workflow every 30 minutes (a full feed read) and replaces itself before GitHub's six-hour job limit. Ownership approved it on November 20, 2026, after GitHub's own schedule ran a twice-an-hour refresh once in eleven hours. Free while the repository is public; delete the file first if the repository is ever made private. |
| `public/vendor/tech-ticker.js`, `site-ticker.js`, `site-ticker.css` | The technology stock ticker (TradingView's free widget) and the band that shows it at the top of every public page. Not on the subscribe page or the client proposal pages. |
| `public/newswire/latest.json` | Up to sixteen of the newest headlines from across the technology sector, one per source (`strip_ok`). The news strip at the bottom of every page reads it. |
| `scripts/newswire-tools/test_newswire.py` | Offline checks: hostile feed content must come out as plain, escaped text. |
| `scripts/newswire-tools/candidates.py`, `curate.py` | How the source list was made (below). |

## Rules the builder keeps

- For each story: headline, source name, time, an excerpt of at most 160 characters and a link to the publisher. Nothing else is copied.
- The source count on the pages is the number of feeds that answered in the last seven days, not the length of the list.
- Shopping posts, puzzles and similar filler from general outlets are left out (`NOISE_RE`).
- Dates read month, day, year. Times are Eastern.

## Add or remove one source

Edit `scripts/newswire_sources.json` by hand: `name`, `feed`, `site`, and `cat` (one of labs, research, ainews, safety, policy, chips, biz, sec, dev, tech, bigtech, sci, community). A source in `ainews`, `labs`, `research` or `safety` has every story counted as AI; the others are sorted by the words in each headline.

## Rebuild the whole list

```bash
python3 -I scripts/newswire-tools/candidates.py <folder of downloaded public feed lists> candidates.json
```

```bash
python3 scripts/newswire.py check candidates.json report.json
```

```bash
python3 -I scripts/newswire-tools/curate.py scripts/newswire_sources.json
```

`check` keeps a feed only if it answers, parses, is in English and has published in the last 120 days. `report.json` says why each of the others was left out.

## Test

```bash
python3 scripts/newswire-tools/test_newswire.py
```
