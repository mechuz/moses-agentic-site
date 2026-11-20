"""Offline checks for scripts/newswire.py: hostile feed content must come out as plain, escaped text.

Usage: python3 scripts/newswire-tools/test_newswire.py     (no network; writes to a temporary folder)
"""
import importlib.util
import json
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("nw", HERE.parent / "newswire.py")
nw = importlib.util.module_from_spec(spec)
spec.loader.exec_module(nw)

now = int(time.time())
stamp = nw.email.utils.format_datetime(nw.dt.datetime.fromtimestamp(now - 600, nw.dt.timezone.utc))
RSS = ("""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Test &amp; Co</title><link>https://example.com/?a=1&b=2</link><language>en-US</language>
<item><title>OpenAI ships a model &lt;script&gt;alert(1)&lt;/script&gt; "quoted" &nbsp;here</title><link>https://example.com/a?utm_source=x&id=7</link>
<pubDate>%s</pubDate><description><![CDATA[<p onclick="x()">Body <img src=x onerror=alert(2)> text about superintelligence and AGI timelines that is long enough to be kept as an excerpt.</p><script>bad()</script>]]></description></item>
<item><title>Link that is not http</title><link>javascript:alert(3)</link><pubDate>%s</pubDate></item>
<item><title>Black Friday deals: 40%% off laptops</title><link>https://example.com/deals</link><pubDate>%s</pubDate></item>
<item><title>Old story</title><link>https://example.com/old</link><pubDate>Mon, 01 Jan 2024 10:00:00 GMT</pubDate></item>
<item><title>&lt;/script&gt;&lt;script&gt;alert(4)&lt;/script&gt; breakout attempt in a chip headline about Nvidia</title><link>https://example.com/b</link><pubDate>%s</pubDate></item>
</channel></rss>""" % (stamp, stamp, stamp, stamp)).encode()
ATOM = ("""<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom Lab</title><link rel="alternate" href="https://lab.example/"/>
<entry><title type="html">A new robot &amp;amp; a humanoid</title><link rel="alternate" href="/posts/1"/><updated>%s</updated><summary>Short.</summary></entry></feed>"""
        % nw.dt.datetime.fromtimestamp(now - 1200, nw.dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")).encode()
BOMB = b"""<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;">]><rss><channel><title>&lol2;</title></channel></rss>"""

ok = []


def check(name, cond, detail=""):
    ok.append(bool(cond))
    print(("PASS " if cond else "FAIL ") + name + ((" -> " + str(detail)[:200]) if detail != "" else ""))


f = nw.parse_feed(RSS, "https://example.com/feed")
check("RSS: javascript: link is refused", all(i["link"].startswith("https://") for i in f["items"]) and len(f["items"]) == 4, [i["link"] for i in f["items"]])
check("RSS: channel link with a stray ampersand parses", f["site"] == "https://example.com/?a=1&b=2", f["site"])
a = nw.parse_feed(ATOM, "https://lab.example/feed.xml")
check("Atom: relative link is resolved, date read", a["items"][0]["link"] == "https://lab.example/posts/1" and a["items"][0]["ts"], a["items"])
b = nw.parse_feed(BOMB, "https://x.example/")
check("entity declarations are removed and never expanded", "lol" not in b["title"], repr(b["title"]))
try:
    nw.to_text(b'<?xml version="1.0"?><!DOCTYPE a SYSTEM "http://x.example/a.dtd"><!ENTITY % p SYSTEM "file:///etc/passwd"><rss></rss>')
    check("a second declaration in the prolog is refused", False)
except ValueError as e:
    check("a second declaration in the prolog is refused", "refused" in str(e), e)

sources = [{"name": "Test & <Co>", "feed": "https://example.com/feed", "site": "https://example.com/", "cat": "tech"},
           {"name": "Atom Lab", "feed": "https://lab.example/feed.xml", "site": "https://lab.example/", "cat": "chips"}]
rows = nw.merge(nw.gather(sources, {0: ("ok", f), 1: ("ok", a)}, now), [], now)
titles = [r[2] for r in rows]
check("shopping post and old story are left out", len(rows) == 3 and not any("deals" in t.lower() or "Old" in t for t in titles), titles)
check("tracking parameters are removed from links", any(r[3] == "https://example.com/a?id=7" for r in rows), [r[3] for r in rows])
first = [r for r in rows if r[3].endswith("id=7")][0]
check("topics: AI and superintelligence found from the text", first[5] & nw.BIT["ai"] and first[5] & nw.BIT["superintelligence"], first[5])
check("topics: chips and robotics found from the headline", any(r[5] & nw.BIT["chips"] for r in rows) and any(r[5] & nw.BIT["robotics"] for r in rows))
check("excerpt has no markup", "<" not in first[4] and "onerror" not in first[4] and "bad()" not in first[4], first[4])

with tempfile.TemporaryDirectory() as d:
    nw.PUBLIC = Path(d)
    nw.OUT = Path(d) / "newswire"
    (Path(d) / "sitemap.xml").write_text('<?xml version="1.0"?>\n<urlset>\n</urlset>\n')
    nw.write_pages(rows, sources, {s["feed"]: now for s in sources}, now)
    page = (nw.OUT / "index.html").read_text()
    body = page.split("<main>")[1].split("</main>")[0]
    check("page: no live script or handler from feed text", "<script>alert" not in page and "onerror=alert" not in page and "onclick=" not in body, "")
    check("page: markup in a headline is removed, the words stay", 'OpenAI ships a model &quot;quoted&quot; here' in body and "alert(1)" not in body and "alert(4)" not in page)
    ld = page.split('<script type="application/ld+json">')[1].split("</script>")[0]
    check("page: structured data cannot close its script tag", "<" not in ld and json.loads(ld)["mainEntity"]["itemListElement"], "")
    check("page: source name is escaped", "Test &amp; &lt;Co&gt;" in body)
    check("page: dates read month first", "%s %d, %d" % (nw.MONTHS[nw.eastern(now - 600).month - 1], nw.eastern(now - 600).day, nw.eastern(now - 600).year) in body)
    data = json.loads((nw.OUT / "items.json").read_text())
    check("data file: rows, sources and last-answered times", len(data["items"]) == 3 and data["active"] == 2 and data["src"][0][3] == now)
    latest = json.loads((nw.OUT / "latest.json").read_text())
    check("front-page file: newest AI headlines as [headline, source], markup already removed", len(latest["items"]) >= 1 and all(len(x) == 2 and "<" not in x[0] for x in latest["items"]), latest)
    check("page: the shared ticker band is first in the body and its loader is in the head", '<body>\n<div class="site-ticker" id="site-ticker"' in page and '/vendor/site-ticker.js' in page.split("</head>")[0] and 'id="tape"' not in page)
    for key in nw.TOPIC_KEYS[1:]:
        if not (nw.OUT / key / "index.html").exists():
            check("topic page written: " + key, False)
    check("topic pages, sources page, feed and sitemap written", (nw.OUT / "sources" / "index.html").exists() and (nw.OUT / "feed.xml").exists()
          and "/newswire/superintelligence/" in (Path(d) / "sitemap.xml").read_text())
    import xml.etree.ElementTree as ET
    ET.parse(nw.OUT / "feed.xml")
    check("combined feed is well-formed XML", True)
    # a second run re-reads its own data file and does not duplicate anything
    old, last_ok = [], {}
    prev = json.loads((nw.OUT / "items.json").read_text())
    by = {s["feed"]: i for i, s in enumerate(sources)}
    again = nw.merge(nw.gather(sources, {0: ("ok", f), 1: ("ok", a)}, now), [[r[0], by[prev["src"][r[1]][2]], r[2], r[3], r[4], r[5]] for r in prev["items"]], now)
    check("a second run adds no duplicates", len(again) == 3, len(again))

print("%d of %d checks passed" % (sum(ok), len(ok)))
sys.exit(0 if all(ok) else 1)
