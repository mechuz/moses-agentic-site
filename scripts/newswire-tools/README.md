# AI Newswire: how it is built and how to change the sources

`/newswire/` on mosesagentic.com lists headlines from the feeds in `scripts/newswire_sources.json`.

| File | What it is |
|---|---|
| `scripts/newswire.py` | The builder. Standard library only. `build` reads every feed; `reuse` re-makes the pages from the items already live. |
| `scripts/newswire_sources.json` | The source list: name, feed address, site address, category. |
| `public/newswire/` | The pages. The deploy workflow rebuilds them whenever GitHub's schedule fires; the copy in the repo is only the fallback. The schedule asks for twice an hour, but GitHub ran it once in eleven hours on November 20, 2026, so the pages make no promise about how often they refresh. A dependable refresh needs ownership's decision (see the CMO open items). |
| `public/vendor/tech-ticker.js`, `site-ticker.js`, `site-ticker.css` | The technology stock ticker (TradingView's free widget) and the band that shows it at the top of every public page. Not on the subscribe page or the client proposal pages. |
| `public/newswire/latest.json` | Ten of the newest AI headlines, one per source. The front page's news button reads it. |
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
