#!/usr/bin/env python3
"""Tech Newswire for mosesagentic.com: reads hundreds of RSS and Atom feeds and writes public/newswire/.
The main page (/newswire/) is the whole technology sector; each topic has its own page (/newswire/ai/ and so on).

Standard library only, so it runs on a plain GitHub runner with no install step.

  python3 scripts/newswire.py build     fetch every feed, merge with the last published items, write the pages
  python3 scripts/newswire.py reuse     no feed fetching: re-render the pages from the last published items
  python3 scripts/newswire.py check <candidates.json> <report.json>
                                        test candidate feeds and write scripts/newswire_sources.json

What is published for each story: the headline, the source's name, the time, a short excerpt and a link to the
source. Nothing else is copied. Feed content is treated as untrusted text: it is parsed with entity declarations
refused, stripped of markup, length-limited and HTML-escaped before it is written anywhere.
"""
import datetime as dt
import email.utils
import hashlib
import html
import html.entities
import json
import os
import queue
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zlib
from pathlib import Path as _P
sys.path.insert(0, str(_P(__file__).resolve().parent))
import site_shell  # noqa: E402  the front page's header, hero, bottom menu and footer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
OUT = PUBLIC / "newswire"
SOURCES = ROOT / "scripts" / "newswire_sources.json"
SITE = "https://mosesagentic.com"
LIVE_ITEMS = SITE + "/newswire/items.json"
# A generic reader name. Feeds are public; nothing about this site is sent to them.
UA = "Mozilla/5.0 (compatible; newswire-reader/1.0; RSS and Atom feed reader)"

FEED_BYTES = 3_000_000      # a feed larger than this is skipped
FEED_SECONDS = 25           # wall-clock limit for one feed
WORKERS = 32
PER_SOURCE = 10             # newest items taken from one feed in one run
KEEP_DAYS = 4               # stories older than this drop off
KEEP_ITEMS = 2500
PAGE_ITEMS = 200            # headlines written into each page's HTML (the rest load on request)
PAGE_PER_SOURCE = 4         # so one busy outlet cannot fill a page
EXCERPT = 160

# ---------------------------------------------------------------------------------------------- topics

TOPICS = [  # key, label, page title, one-line description
    ("ai", "AI", "AI news", "Every AI headline: models, labs, research, products, policy and the business around them."),
    ("superintelligence", "Superintelligence and safety", "Superintelligence and AI safety news",
     "Superintelligence, AGI timelines, alignment, safety research, governance and policy."),
    ("labs", "Labs and models", "AI labs and model releases", "Announcements from the AI labs and the companies that build and host models."),
    ("research", "Research", "AI research news", "New papers and research notes from universities, labs and arXiv."),
    ("chips", "Chips and compute", "AI chips, compute and data center news", "Semiconductors, GPUs, data centers and the supply chain behind AI."),
    ("robotics", "Robotics", "Robotics and autonomy news", "Robots, humanoids, drones and self-driving."),
    ("business", "Business and funding", "Technology business and funding news", "Funding rounds, acquisitions, earnings and strategy."),
    ("security", "Security", "Cybersecurity news", "Breaches, vulnerabilities and defenses."),
    ("developers", "Developers", "Software engineering news", "Engineering blogs, tools, languages and infrastructure."),
    ("science", "Science and space", "Science and space news", "Science, space and the frontier beyond software."),
    ("technology", "All technology", "All technology news", "The whole technology sector, newest first."),
]
TOPIC_KEYS = [t[0] for t in TOPICS]
BIT = {k: 1 << i for i, k in enumerate(TOPIC_KEYS)}

# what a source's category adds to every one of its stories
CAT_TOPICS = {
    "labs": ["ai", "labs"], "research": ["ai", "research"], "ainews": ["ai"], "safety": ["ai", "superintelligence"],
    "policy": [], "chips": ["chips"], "biz": ["business"], "sec": ["security"], "dev": ["developers"],
    "tech": [], "bigtech": [], "sci": ["science"], "community": [],
}
# The site's news strip (the running headlines at the bottom of every page) carries the whole technology sector, as news:
# the technology and business press, chips and security outlets, and the AI press. Not company blogs, engineering blogs,
# research papers, forums or personal newsletters; and not reviews, shopping deals, explainers or opinion pieces.
STRIP_CATS = {"tech", "biz", "chips", "sec"}
STRIP_AI_PRESS = re.compile(r":|^(The Decoder|AI Business|AI News|Analytics India Magazine|MIT Technology Review|Singularity Hub|MarkTechPost|Unite\.AI|AIwire|BigDATAwire|DailyAI|TestingCatalog|insideAI News)$")
STRIP_SKIP = re.compile(
    r"\b(reviews?|reviewed|hands-on|unboxing|steal|bargain|how to|tips|tricks|explained|explainer|vs\.?|versus|podcast|episode|"
    r"newsletter|opinion|quiz|giveaway|sponsored|webinar|awards?|recap|round-?up|weekly|this week|guide|wallpapers?|rumou?rs?|"
    r"leak(s|ed)?|interview|q&a|on sale|lowest price|cheapest|buy|my)\b"
    r"|^(how|why|what|when|where|who|is|are|can|should|do|does|will|here|these|this|the best|my|our|i|we|\d+ )\b", re.I)
STRIP_PRICE = re.compile(r"\$\d[\d,.]*(?![\d,.])(?!\s?(million|billion|trillion|bn|[mbk]\b))", re.I)   # "$200", not "$200 million"
TECH_CS = re.compile(r"\b(AI|EVs?|VR|AR|PCs?|IPO|VC|APIs?|SaaS|GPUs?|CPUs?|LLMs?|5G|6G|Arm|AWS|IBM|SAP|AMD|TSMC|ASML|NASA|FTC|FCC)\b")
TECH_RE = re.compile(
    r"\b(tech|technology|software|hardware|apps?|cloud|chips?|chipmakers?|semiconductors?|data cent(er|re)s?|cyber\w*|hack\w*|"
    r"startups?|robots?|robotics?|robotaxis?|quantum|internet|smartphones?|iphones?|ipads?|macbooks?|android|windows|linux|google|"
    r"alphabet|apple|microsoft|amazon|meta|facebook|instagram|whatsapp|tiktok|youtube|netflix|spotify|nvidia|intel|qualcomm|"
    r"broadcom|samsung|sony|openai|anthropic|chatgpt|claude|gemini|copilot|deepmind|xai|grok|mistral|tesla|spacex|starlink|waymo|"
    r"uber|salesforce|oracle|adobe|palantir|snowflake|databricks|stripe|shopify|coinbase|crypto\w*|bitcoin|blockchain|"
    r"self-driving|autonomous|drones?|satellites?|broadband|browsers?|open[- ]source|developers?|github|ransomware|malware|"
    r"breach(es|ed)?|vulnerabilit\w+|zero-day|musk|zuckerberg|altman|bezos|nadella|pichai|streaming|xbox|playstation|nintendo|"
    r"headsets?|wearables?|smartwatch\w*|laptops?|processors?|silicon|foundr(y|ies)|telecoms?|wireless|fintech|e-?commerce|"
    r"automation|algorithms?|outages?|artificial intelligence|machine learning|compute|servers?|encryption|antitrust)\b", re.I)


def strip_ok(title, source, bits):
    """Is this headline right for the site's news strip?"""
    if not (source["cat"] in STRIP_CATS or (source["cat"] == "ainews" and STRIP_AI_PRESS.search(source["name"]))):
        return False
    if not 30 <= len(title) <= 110 or title.endswith("?") or STRIP_SKIP.search(title) or STRIP_PRICE.search(title):
        return False
    return bool(TECH_CS.search(title) or TECH_RE.search(title) or bits & (BIT["ai"] | BIT["chips"] | BIT["robotics"] | BIT["security"]))
CAT_LABELS = [
    ("labs", "AI labs and model builders"), ("research", "Research"), ("ainews", "AI news and analysis"),
    ("safety", "Superintelligence, safety and governance"), ("policy", "Policy and society"), ("chips", "Chips, compute and robotics"),
    ("biz", "Business and funding"), ("sec", "Security"), ("dev", "Engineering blogs and developer news"),
    ("tech", "Technology press"), ("bigtech", "Company newsrooms"), ("sci", "Science and space"), ("community", "Community"),
]

AI_CS = re.compile(r"\b(AI|A\.I\.|AIs|AGI|ASI|LLM|LLMs|GPT|GPTs|RAG|NLP|ML)\b")
AI_RE = re.compile(
    r"\b(artificial intelligence|machine[- ]learning|deep learning|neural net\w*|large language models?|language models?|"
    r"generative ai|gen ?ai|chatgpt|openai|anthropic|deepmind|copilot|hugging ?face|chatbots?|agentic|ai agents?|"
    r"superintelligen\w+|foundation models?|fine-?tun\w+|deepseek|perplexity|midjourney|stable diffusion|diffusion models?|"
    r"reinforcement learning|computer vision|gemini (\d|pro|flash|ultra|nano)|claude|llama ?\d|mistral ai|grok|xai|"
    r"multimodal|text-to-(image|video|speech)|ai-(powered|generated|native|first|driven)|transformer models?|"
    r"vector databases?|embeddings|prompt engineering|model weights|open-weights?|reasoning models?|world models?)\b", re.I)
SUPER_CS = re.compile(r"\b(AGI|ASI)\b")
SUPER_RE = re.compile(
    r"\b(superintelligen\w+|artificial general intelligence|ai safety|safe ai|ai alignment|alignment (research|problem|faking)|"
    r"existential risks?|x-risk|frontier (ai|models?)|ai (risks?|governance|regulation|regulations|policy|act|treaty|moratorium|pause|"
    r"doom\w*|takeover|welfare|consciousness|sentien\w+|oversight|safety)|misalign\w+|interpretability|red[- ]team\w*|"
    r"recursive self-improvement|intelligence explosion|the singularity|human-level ai|transformative ai|loss of control|rogue ai|"
    r"deceptive alignment|model welfare|responsible scaling|safety (framework|evals?|evaluations?|institute)|catastrophic risks?|"
    r"compute governance|chip export controls?|ai export controls?|ai timelines?|automated ai research|ai r&d automation)\b", re.I)
CHIPS_RE = re.compile(
    r"\b(nvidia|gpus?|semiconductors?|chipmakers?|chips?|tsmc|data cent(er|re)s?|foundr(y|ies)|wafers?|asml|hbm|"
    r"accelerators?|supercomputers?|tpus?|compute (cluster|capacity)|gigawatts?|hyperscalers?|micron|sk hynix|qualcomm)\b", re.I)
ROBOT_RE = re.compile(r"\b(robots?|robotics?|humanoids?|drones?|self-driving|robotaxis?|autonomous (vehicles?|driving|trucks?)|waymo|optimus|quadrupeds?)\b", re.I)
BIZ_RE = re.compile(
    r"\b(raises?|raised|funding|series [a-f]\b|seed round|valuation|valued at|ipo|acquires?|acquired|acquisition|merger|"
    r"earnings|revenue|layoffs?|lays off|\$\d[\d.,]* ?(billion|million|bn|m|b)\b|venture|investors?|antitrust)\b", re.I)
SEC_RE = re.compile(
    r"\b(breach(es|ed)?|ransomware|vulnerabilit(y|ies)|malware|phishing|hack(ed|ers?|ing)?|zero-days?|cve-\d+|exploit(s|ed)?|"
    r"cyber ?attacks?|cybersecurity|botnets?|spyware|data leak|credential\w*|patch tuesday)\b", re.I)
# shopping and filler posts from general outlets are left out
NOISE_RE = re.compile(
    r"(\bdeals?\b|% off|\bsave \$|black friday|cyber monday|prime day|coupons?|promo codes?|gift guide|gifts? for|how to watch|"
    r"\bwordle\b|connections (hints|answers)|\bstrands\b|crossword|horoscope|\bbest \w+( \w+){0,3} (of|for|in|to buy|you can)\b|"
    r"lowest price|on sale|discount|price drop|sponsored|\bgiveaway\b|live ?stream:|quordle|mini crossword)", re.I)

# ---------------------------------------------------------------------------------------------- fetching


def fetch(url):
    """Returns the body of a public http(s) URL. A server that answers "busy" is asked once more."""
    try:
        return fetch_once(url)
    except urllib.error.HTTPError as e:
        if e.code not in (429, 500, 502, 503, 504, 520, 522, 524):
            raise
    time.sleep(4)
    return fetch_once(url)


def fetch_once(url):
    """Returns the body of a public http(s) URL, size- and time-limited."""
    if not re.match(r"^https?://", url, re.I):
        raise ValueError("not an http(s) address")
    req = urllib.request.Request(url, headers={
        "User-Agent": UA, "Accept-Encoding": "gzip",
        "Accept": "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5"})
    start = time.time()
    with urllib.request.urlopen(req, timeout=12) as r:
        chunks, size = [], 0
        while True:
            c = r.read(65536)
            if not c:
                break
            size += len(c)
            if size > FEED_BYTES:
                raise ValueError("larger than the size limit")
            if time.time() - start > FEED_SECONDS:
                raise TimeoutError("slower than the time limit")
            chunks.append(c)
        raw = b"".join(chunks)
        if (r.headers.get("Content-Encoding") or "").lower() == "gzip" or raw[:2] == b"\x1f\x8b":
            d = zlib.decompressobj(47)
            raw = d.decompress(raw, FEED_BYTES * 4)
            if d.unconsumed_tail:
                raise ValueError("larger than the size limit once unpacked")
    return raw


def fetch_all(sources, budget):
    """Fetches and parses every source in parallel. Returns {index: ("ok", feed) or ("err", reason)}."""
    q, res = queue.Queue(), {}
    for i, s in enumerate(sources):
        q.put((i, s))

    def work():
        while True:
            try:
                i, s = q.get_nowait()
            except queue.Empty:
                return
            try:
                res[i] = ("ok", parse_feed(fetch(s["feed"]), s["feed"]))
            except Exception as e:  # one bad feed never stops the run
                res[i] = ("err", (type(e).__name__ + ": " + str(e))[:140])

    threads = [threading.Thread(target=work, daemon=True) for _ in range(WORKERS)]
    for t in threads:
        t.start()
    end = time.time() + budget
    for t in threads:
        t.join(max(0.0, end - time.time()))
    return dict(res)

# ---------------------------------------------------------------------------------------------- parsing


TAG_RE = re.compile(r"<[^>]{0,2000}>")
WS_RE = re.compile(r"\s+")


def clean(s, limit=4000):
    """Feed text to plain text: markup removed, entities decoded, whitespace collapsed."""
    s = str(s or "")[:limit]
    s = re.sub(r"(?is)<(script|style)\b.*?</\1>", " ", s)
    s = TAG_RE.sub(" ", s)
    s = html.unescape(html.unescape(s))
    s = TAG_RE.sub(" ", s)
    s = re.sub(r"[\x00-\x1f\x7f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]", " ", s)
    return WS_RE.sub(" ", s).strip()


def excerpt_of(text, title):
    t = clean(text)
    t = re.sub(r"^arXiv:\S+ Announce Type: \S+ Abstract: ", "", t)
    t = re.sub(r"\s*The post .{0,200} (appeared first on|first appeared on) .{0,120}$", "", t)
    t = re.sub(r"\s*(Continue reading|Read more|Read the full (story|article)|\[\u2026\]|\[\.\.\.\]).{0,60}$", "", t, flags=re.I)
    if not t or t.lower().startswith(title.lower()[:60]) or len(t) < 40:
        return ""
    if len(t) <= EXCERPT:
        return t
    cut = t[:EXCERPT].rsplit(" ", 1)[0].rstrip(",;:.-")
    return cut + "\u2026"


def parse_date(s):
    s = (s or "").strip()
    if not s:
        return None
    try:
        d = email.utils.parsedate_to_datetime(s)
    except Exception:
        d = None
    if d is None:
        m = re.match(r"(\d{4})-(\d\d)-(\d\d)(?:[T ](\d\d):(\d\d)(?::(\d\d))?(?:\.\d+)?)?\s*(Z|[+-]\d\d:?\d\d)?", s)
        if not m:
            return None
        y, mo, da, h, mi, se, tz = m.groups()
        try:
            d = dt.datetime(int(y), int(mo), int(da), int(h or 12), int(mi or 0), int(se or 0))
        except ValueError:
            return None
        if tz and tz != "Z":
            sign = 1 if tz[0] == "+" else -1
            off = dt.timedelta(hours=int(tz[1:3]), minutes=int(tz[-2:]))
            d = d.replace(tzinfo=dt.timezone(sign * off))
        else:
            d = d.replace(tzinfo=dt.timezone.utc)
    if d.tzinfo is None:
        d = d.replace(tzinfo=dt.timezone.utc)
    try:
        return int(d.timestamp())
    except (OverflowError, ValueError):
        return None


def to_text(raw):
    m = re.match(rb"\s*<\?xml[^>]{0,200}encoding=[\"']([A-Za-z0-9._-]+)[\"']", raw[:300])
    enc = m.group(1).decode("ascii") if m else "utf-8"
    try:
        text = raw.decode(enc, errors="replace")
    except LookupError:
        text = raw.decode("utf-8", errors="replace")
    text = text.lstrip("\ufeff \r\n\t")
    text = re.sub(r"^<\?xml[^>]*\?>", "", text, count=1)
    # A document type declaration can only sit before the first element. It is removed, and a feed that still
    # declares one (or any entity) there is refused. The same words inside an article further down are plain text.
    m = re.search(r"<[A-Za-z]", text)
    if not m:
        raise ValueError("not a feed")
    prolog, rest = text[:m.start()], text[m.start():]
    prolog = re.sub(r"<!DOCTYPE[^>\[]{0,500}(\[[^\]]{0,5000}\])?\s*>", "", prolog, count=1, flags=re.I)
    if re.search(r"<!ENTITY|<!DOCTYPE", prolog, re.I):
        raise ValueError("entity declarations are refused")
    if re.match(r"<html\b", rest, re.I):
        raise ValueError("a web page, not a feed")
    text = prolog + rest

    def ent(m):
        n = m.group(1)
        if n in ("amp", "lt", "gt", "quot", "apos"):
            return m.group(0)
        cp = html.entities.name2codepoint.get(n)
        return "&#%d;" % cp if cp else " "

    text = re.sub(r"&([A-Za-z][A-Za-z0-9]{1,30});", ent, text)
    text = re.sub(r"&(?!#\d{1,7};|#x[0-9A-Fa-f]{1,6};|amp;|lt;|gt;|quot;|apos;)", "&amp;", text)
    return re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)


def local(tag):
    return tag.rsplit("}", 1)[-1].lower() if isinstance(tag, str) else ""


def first(el, *names):
    for n in names:
        for c in el:
            if local(c.tag) == n and (c.text or "").strip():
                return c.text.strip()
    return ""


def link_of(el, base):
    href = ""
    for c in el:
        if local(c.tag) == "origlink" and (c.text or "").strip():
            href = c.text.strip()
            break
    if not href:
        cands = [c for c in el if local(c.tag) == "link"]
        for c in cands:  # Atom: the alternate link
            if c.attrib.get("href") and c.attrib.get("rel", "alternate") == "alternate":
                href = c.attrib["href"].strip()
                break
        if not href:
            for c in cands:
                if (c.text or "").strip():
                    href = c.text.strip()
                    break
        if not href:
            for c in cands:
                if c.attrib.get("href"):
                    href = c.attrib["href"].strip()
                    break
    if not href:
        for c in el:
            if local(c.tag) in ("guid", "id") and re.match(r"^https?://", (c.text or "").strip()) and c.attrib.get("isPermaLink", "true") != "false":
                href = c.text.strip()
                break
    if not href:
        return ""
    href = urllib.parse.urljoin(base, href)
    return href if re.match(r"^https?://[^\s<>\"']{4,600}$", href) else ""


def parse_feed(raw, base):
    """Returns {"title", "site", "lang", "items": [{"title", "link", "ts", "text"}]}."""
    root = ET.fromstring(to_text(raw))
    chan = None
    for el in root.iter():
        if local(el.tag) in ("channel", "feed"):
            chan = el
            break
    if chan is None:
        chan = root
    feed = {"title": clean(first(chan, "title"), 200), "site": link_of(chan, base), "lang": first(chan, "language").lower(), "items": []}
    for el in root.iter():
        if local(el.tag) not in ("item", "entry"):
            continue
        title = clean(first(el, "title"), 400)
        link = link_of(el, base)
        if not title or not link:
            continue
        ts = parse_date(first(el, "pubdate", "published", "date", "updated", "issued", "modified", "created"))
        feed["items"].append({"title": title[:240], "link": link, "ts": ts, "text": first(el, "description", "summary", "encoded", "content")})
        if len(feed["items"]) >= 400:
            break
    return feed

# ---------------------------------------------------------------------------------------------- items


DROP_PARAMS = re.compile(r"^(utm_\w+|fbclid|gclid|mc_cid|mc_eid|cmpid|ftag|guccounter|guce_\w+|ref|ref_src|source|ncid|sref|smid|cid|ocid|feed|rss|at_medium|at_campaign|traffic_source|taid|__twitter_impression|share)$", re.I)


def tidy_url(u):
    p = urllib.parse.urlsplit(u)
    q = [(k, v) for k, v in urllib.parse.parse_qsl(p.query, keep_blank_values=True) if not DROP_PARAMS.match(k)]
    return urllib.parse.urlunsplit((p.scheme.lower(), p.netloc.lower(), p.path, urllib.parse.urlencode(q), ""))


def url_key(u):
    p = urllib.parse.urlsplit(u)
    host = re.sub(r"^www\.", "", p.netloc.lower())
    return host + p.path.rstrip("/") + ("?" + p.query if p.query else "")


def title_key(t):
    return re.sub(r"[^a-z0-9]+", "", t.lower())[:90]


def topics_for(title, text, cat):
    hay = title + " " + text[:600]
    keys = set(CAT_TOPICS.get(cat, []))
    is_ai = bool(AI_CS.search(hay) or AI_RE.search(hay))
    if is_ai:
        keys.add("ai")
    if SUPER_CS.search(hay) or SUPER_RE.search(hay):
        keys.update(("ai", "superintelligence"))
    if CHIPS_RE.search(title):
        keys.add("chips")
    if ROBOT_RE.search(title):
        keys.add("robotics")
    if BIZ_RE.search(title):
        keys.add("business")
    if SEC_RE.search(title):
        keys.add("security")
    keys.add("technology")
    bits = 0
    for k in keys:
        bits |= BIT[k]
    return bits


def gather(sources, results, now):
    """Turns parsed feeds into item rows: [ts, source index, title, url, excerpt, topic bits]."""
    rows = []
    for i, s in enumerate(sources):
        status, feed = results.get(i, ("err", "no answer in time"))
        if status != "ok":
            continue
        items = [it for it in feed["items"] if it["ts"] and it["ts"] <= now + 3600]
        items.sort(key=lambda it: -it["ts"])
        taken = 0
        for it in items:
            if taken >= int(s.get("max", PER_SOURCE)):
                break
            if it["ts"] < now - KEEP_DAYS * 86400:
                break
            if NOISE_RE.search(it["title"]):
                continue
            text = clean(it["text"])
            rows.append([min(it["ts"], now), i, it["title"], tidy_url(it["link"]), excerpt_of(text, it["title"]), topics_for(it["title"], text, s["cat"])])
            taken += 1
    return rows


def merge(rows, old_rows, now):
    """New rows plus the last published ones: de-duplicated, pruned, newest first."""
    seen_u, seen_t, out = {}, {}, []
    for r in sorted(rows, key=lambda r: -r[0]) + old_rows:
        ku, kt = url_key(r[3]), title_key(r[2])
        hit = seen_u.get(ku) or (len(kt) > 24 and seen_t.get(kt))
        if hit:
            hit[5] |= r[5]          # the same story from two feeds keeps both sets of topics
            hit[0] = min(hit[0], r[0])
            continue
        seen_u[ku] = r
        seen_t[kt] = r
        out.append(r)
    out.sort(key=lambda r: -r[0])
    fresh = [r for r in out if r[0] >= now - KEEP_DAYS * 86400]
    if len(fresh) < 400:
        fresh = out[:400]
    return fresh[:KEEP_ITEMS]


def load_previous(sources):
    """The last published items, re-pointed at today's source list. Live site first, then the copy in the repo."""
    data = None
    try:
        data = json.loads(fetch(LIVE_ITEMS).decode("utf-8"))
    except Exception as e:
        print("live items not available:", str(e)[:100])
    if data is None and (OUT / "items.json").exists():
        try:
            data = json.loads((OUT / "items.json").read_text(encoding="utf-8"))
        except Exception as e:
            print("repo items not readable:", str(e)[:100])
    if not isinstance(data, dict):
        return [], {}
    by_feed = {s["feed"]: i for i, s in enumerate(sources)}
    old_src = data.get("src") or []
    last_ok = {}
    for s in old_src:
        try:
            if s[2] in by_feed and int(s[3]) > 0:
                last_ok[s[2]] = int(s[3])
        except Exception:
            pass
    rows = []
    for r in data.get("items") or []:
        try:
            ts, si, title, url, ex, bits = int(r[0]), int(r[1]), str(r[2])[:240], str(r[3]), str(r[4])[:EXCERPT + 2], int(r[5])
            feed_url = old_src[si][2]
        except Exception:
            continue
        if feed_url in by_feed and re.match(r"^https?://", url):
            rows.append([ts, by_feed[feed_url], clean(title, 400), url, clean(ex, 400), bits & ((1 << len(TOPIC_KEYS)) - 1)])
    return rows, last_ok

# ---------------------------------------------------------------------------------------------- pages


def esc(s):
    return html.escape(str(s), quote=True)


try:
    from zoneinfo import ZoneInfo
    ET_ZONE = ZoneInfo("America/New_York")
except Exception:  # no time zone data on this machine
    ET_ZONE = dt.timezone(dt.timedelta(hours=-5))

MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def eastern(ts):
    return dt.datetime.fromtimestamp(ts, ET_ZONE)


def day_label(d):  # month, day, year
    return "%s, %s %d, %d" % (DAYS[d.weekday()], MONTHS[d.month - 1], d.day, d.year)


def clock(d):
    return "%d:%02d %s" % (d.hour % 12 or 12, d.minute, "AM" if d.hour < 12 else "PM")


CSS = """
/* The newswire's own parts. Header, moving-dot hero, bottom menu, footer, type and colors: /vendor/site-shell.css
   (the front page's look, shared with Insights and Technology news). */
html { scroll-behavior:smooth; }
@media (prefers-reduced-motion: reduce) { html { scroll-behavior:auto; } }
input:focus-visible { outline:3px solid var(--ms-ink); outline-offset:3px; }
.stats { display:flex; flex-wrap:wrap; justify-content:center; gap:.5rem 2.4rem; margin:1.6rem 0 0; padding:0; list-style:none; color:var(--ms-mut); font-size:1rem; }
.stats b { display:block; font:500 clamp(1.9rem, 3.4vw, 3rem)/1.05 var(--ms-f); letter-spacing:-.035em; color:var(--ms-blue); }
.bar { position:sticky; top:76px; z-index:15; background:#FFFFFF; border-top:1px solid var(--ms-line); border-bottom:1px solid var(--ms-line); }
html.has-ticker .bar { top:123px; }
.bar .ms-wrap { padding-top:.75rem; padding-bottom:.75rem; display:grid; gap:.65rem; }
.chips { display:flex; gap:.5rem; overflow-x:auto; scrollbar-width:none; padding-bottom:2px; }
.chips::-webkit-scrollbar { display:none; }
.chips a { flex:none; background:#FFFFFF; border:1px solid var(--ms-line); border-radius:999px; padding:.45rem 1rem; font:500 1rem/1.2 var(--ms-f); color:var(--ms-ink); text-decoration:none; white-space:nowrap; }
.chips a:hover { border-color:var(--ms-blue); color:var(--ms-blue); }
.chips a[aria-current="page"] { background:var(--ms-lime); border-color:var(--ms-lime); color:var(--ms-ink); font-weight:600; }
.find { display:flex; gap:.6rem; align-items:center; }
.find input { flex:1; min-width:0; height:46px; border:1px solid var(--ms-edge); border-radius:999px; padding:0 1.1rem; font:400 1rem var(--ms-f); color:var(--ms-ink); background:#FFFFFF; }
.find input::placeholder { color:var(--ms-mut); }
.find span { color:var(--ms-mut); font-size:1rem; white-space:nowrap; }
main .ms-wrap { padding-top:.4rem; padding-bottom:1rem; }
.day { font:600 1rem/1.3 var(--ms-f); color:var(--ms-ink); margin:2.2rem 0 .4rem; }
.feed { list-style:none; margin:0; padding:0; }
.it { display:grid; grid-template-columns:190px 1fr; gap:.2rem 1.4rem; padding:.9rem 0; border-bottom:1px solid var(--ms-line); }
.it .meta { color:var(--ms-mut); font-size:1rem; line-height:1.35; padding-top:.15rem; }
.it time { display:block; }
.it .src { color:var(--ms-ink); font-weight:600; text-decoration:none; }
.it .src:hover { color:var(--ms-blue); }
.it .hl { font:500 1.18rem/1.3 var(--ms-f); letter-spacing:-.02em; color:var(--ms-ink); text-decoration:none; }
.it .hl:hover { color:var(--ms-blue); }
.it .hl:visited { color:#5A6B85; }
.it p { margin:.25rem 0 0; color:var(--ms-mut); font-size:1rem; line-height:1.45; }
.it .tgs { display:flex; flex-wrap:wrap; gap:.4rem; margin:.45rem 0 0; }
.it .tg { background:var(--ms-soft); border:1px solid var(--ms-line); border-radius:999px; padding:.12rem .7rem; font:500 1rem/1.4 var(--ms-f); color:var(--ms-mut); }
.more { display:flex; justify-content:center; margin:1.8rem 0 0; }
.empty { color:var(--ms-mut); padding:2rem 0; font:italic 400 1.5rem/1.4 var(--ms-fs); text-align:center; }
.panel { background:var(--ms-soft); border:1px solid var(--ms-line); border-radius:24px; padding:2.2rem 1.8rem; margin-top:2.6rem; text-align:center; }
.panel h2 { font:600 clamp(1.6rem, 3vw, 2.2rem)/1.15 var(--ms-f); letter-spacing:-.03em; margin:0 0 .6rem; color:var(--ms-ink); }
.panel p { margin:0 auto 1.2rem; color:var(--ms-mut); max-width:58ch; }
.note { color:var(--ms-mut); font-size:1rem; margin:1.6rem auto 0; max-width:75ch; text-align:center; }
.srcs h2 { font:600 1.1rem/1.3 var(--ms-f); color:var(--ms-ink); margin:2.4rem 0 .8rem; }
.srcs ul { list-style:none; margin:0; padding:0; display:grid; grid-template-columns:repeat(auto-fill, minmax(230px, 1fr)); gap:.35rem 1.4rem; }
.srcs a { color:var(--ms-ink); text-decoration:none; font-weight:500; }
.srcs a:hover { color:var(--ms-blue); }
@media (max-width:700px) {
  .bar { position:static; } .find span { display:none; }
  .stats { gap:.4rem 1.6rem; }
  .it { grid-template-columns:1fr; } .it .meta { display:flex; gap:.6rem; padding-top:0; } .it time { display:inline; }
}
"""

# The page script: Eastern-time labels, search and "show more" from items.json. Everything it writes goes through textContent.
JS = r"""
(function () {
  var C = JSON.parse(document.getElementById("nw").textContent);
  var list = document.getElementById("list"), q = document.getElementById("q"), more = document.getElementById("more"), count = document.getElementById("count");
  var TZ = "America/New_York";
  var fDay = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "long", month: "long", day: "numeric", year: "numeric" });
  var fClock = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
  function ago(ts) { var s = Date.now() / 1000 - ts; if (s < 90) return "Just now"; if (s < 3600) return Math.round(s / 60) + " min ago"; if (s < 86400) return Math.round(s / 3600) + " hr ago"; return ""; }
  function stamp() { Array.prototype.forEach.call(document.querySelectorAll(".it time"), function (t) { var a = ago(+t.getAttribute("data-t")); if (a) t.textContent = a; }); }
  stamp(); setInterval(stamp, 60000);

  var data = null, loading = null, shown = 0, rows = [];
  function load() {
    if (data) return Promise.resolve(data);
    if (!loading) loading = fetch("/newswire/items.json", { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) { data = d; return d; });
    return loading;
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function safe(u) { return /^https?:\/\//i.test(u) ? u : "#"; }
  function row(r) {
    var s = data.src[r[1]] || ["", "", ""], li = el("li", "it"), meta = el("div", "meta"), t = el("time", "", ago(r[0]) || fClock.format(new Date(r[0] * 1000)));
    t.setAttribute("datetime", new Date(r[0] * 1000).toISOString()); t.setAttribute("data-t", r[0]); meta.appendChild(t);
    var a = el("a", "src", s[0]); a.href = safe(s[1]); a.target = "_blank"; a.rel = "noopener"; meta.appendChild(a); li.appendChild(meta);
    var b = el("div"), h = el("a", "hl", r[2]); h.href = safe(r[3]); h.target = "_blank"; h.rel = "noopener"; b.appendChild(h);
    if (r[4]) b.appendChild(el("p", "", r[4]));
    var tg = C.tags.filter(function (x) { return r[5] & x[0]; }).slice(0, 2);
    if (tg.length) { var box = el("div", "tgs"); tg.forEach(function (x) { box.appendChild(el("span", "tg", x[1])); }); b.appendChild(box); }
    li.appendChild(b); return li;
  }
  function draw(reset) {
    if (reset) { list.textContent = ""; shown = 0; }
    var end = Math.min(rows.length, shown + C.page), day = list.getAttribute("data-day") || "", ol = list.lastElementChild && list.lastElementChild.tagName === "OL" ? list.lastElementChild : null;
    if (reset) { day = ""; ol = null; }
    for (var i = shown; i < end; i++) {
      var d = fDay.format(new Date(rows[i][0] * 1000));
      if (d !== day || !ol) { day = d; list.appendChild(el("h2", "day", d)); ol = el("ol", "feed"); list.appendChild(ol); }
      ol.appendChild(row(rows[i]));
    }
    list.setAttribute("data-day", day); shown = end;
    if (!rows.length) list.appendChild(el("p", "empty", "No headlines match. Try a shorter search."));
    more.hidden = shown >= rows.length;
  }
  function inTopic(r) { return (r[5] & C.bit) !== 0; }
  more.addEventListener("click", function () {
    more.disabled = true; more.textContent = "Loading";
    load().then(function () {
      if (!rows.length) {
        var have = {}; Array.prototype.forEach.call(list.querySelectorAll("a.hl"), function (a) { have[a.href] = 1; });
        var last = +list.getAttribute("data-last") || 0;
        rows = data.items.filter(function (r) { return inTopic(r) && r[0] <= last && !have[safe(r[3])]; });
        shown = 0; list.setAttribute("data-day", list.getAttribute("data-day0") || "");
      }
      draw(false); more.disabled = false; more.textContent = "Show more headlines";
    }).catch(function () { more.disabled = false; more.textContent = "Could not load. Try again"; });
  });
  var timer = 0, first = list.innerHTML;
  q.addEventListener("input", function () {
    clearTimeout(timer);
    timer = setTimeout(function () {
      var words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
      if (!words.length) { list.innerHTML = first; rows = []; shown = 0; more.hidden = false; count.textContent = C.total; stamp(); return; }
      load().then(function () {
        rows = data.items.filter(function (r) { var hay = (r[2] + " " + r[4] + " " + (data.src[r[1]] || [""])[0]).toLowerCase(); return words.every(function (w) { return hay.indexOf(w) > -1; }); });
        count.textContent = rows.length.toLocaleString("en-US") + (rows.length === 1 ? " match" : " matches") + " across every topic";
        draw(true);
      }).catch(function () { count.textContent = "Search could not load. Try again."; });
    }, 160);
  });
})();
"""


def shell(title, desc, path, body, extra_head="", ld=None):
    """A newswire page in the front page's look: the shared header, bottom menu and footer from site_shell."""
    ld_tag = '<script type="application/ld+json">%s</script>\n' % json.dumps(ld).replace("<", "\\u003c") if ld else ""
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{SITE}{path}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Moses Agentic">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{SITE}{path}">
<meta property="og:image" content="{SITE}/og.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="alternate" type="application/rss+xml" title="Moses Agentic: Tech Newswire" href="/newswire/feed.xml">
{ld_tag}{extra_head}{site_shell.HEAD}
<style>{CSS}</style>
</head>
<body>
{site_shell.TOP}
{body}
{site_shell.footer(dt.datetime.now(dt.timezone.utc).year)}
{site_shell.DOCK}
</body>
</html>
"""


def topic_path(key):
    return "/newswire/" if key == "technology" else "/newswire/%s/" % key


def pick(rows, bit):
    """The newest rows for a topic, with no source taking more than its share of the page."""
    per, out = {}, []
    for r in rows:
        if not r[5] & bit:
            continue
        per[r[1]] = per.get(r[1], 0) + 1
        if per[r[1]] > PAGE_PER_SOURCE:
            continue
        out.append(r)
        if len(out) >= PAGE_ITEMS:
            break
    return out


def render_rows(rows, sources, key):
    parts, day = [], None
    tags = [(BIT[k], lab) for k, lab, _, _ in TOPICS if k not in ("technology", key)]
    for r in rows:
        d = eastern(r[0])
        label = day_label(d)
        if label != day:
            if day is not None:
                parts.append("</ol>")
            parts.append('<h2 class="day">%s</h2><ol class="feed">' % esc(label))
            day = label
        s = sources[r[1]]
        iso = dt.datetime.fromtimestamp(r[0], dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        tg = "".join('<span class="tg">%s</span>' % esc(lab) for b, lab in [x for x in tags if r[5] & x[0]][:2])
        tg = '<div class="tgs">%s</div>' % tg if tg else ""
        ex = "<p>%s</p>" % esc(r[4]) if r[4] else ""
        parts.append(
            '<li class="it"><div class="meta"><time datetime="%s" data-t="%d">%s</time><a class="src" href="%s" target="_blank" rel="noopener">%s</a></div>'
            '<div><a class="hl" href="%s" target="_blank" rel="noopener">%s</a>%s%s</div></li>'
            % (iso, r[0], clock(d), esc(s["site"]), esc(s["name"]), esc(r[3]), esc(r[2]), ex, tg))
    if day is not None:
        parts.append("</ol>")
    return "".join(parts), (day or "")


def write_pages(rows, sources, last_ok, now):
    """last_ok: feed address -> when it last answered. Only sources that answered in the last week are counted and listed."""
    OUT.mkdir(parents=True, exist_ok=True)
    active = [s for s in sources if last_ok.get(s["feed"], 0) >= now - 7 * 86400]
    n_src = len(active)
    total = len(rows)
    shown = sorted(TOPICS, key=lambda x: x[0] != "technology")   # all technology first; TOPICS' own order must not change
    chips_for = lambda cur: "".join(
        '<a href="%s"%s>%s</a>' % (topic_path(k), ' aria-current="page"' if k == cur else "", esc(lab)) for k, lab, _, _ in shown)
    tag_list = [[BIT[k], lab] for k, lab, _, _ in TOPICS if k != "technology"]

    for key, label, ptitle, pdesc in shown:
        bit = BIT[key]
        chosen = pick(rows, bit)
        in_topic = sum(1 for r in rows if r[5] & bit)
        body_rows, last_day = render_rows(chosen, sources, key)
        if key == "technology":
            title = "Tech Newswire: technology headlines from %d sources | Moses Agentic" % n_src
            desc = ("Live headlines from across the technology sector, from %d sources: AI, chips, software, security, "
                    "business and science, in one place and linked to the source." % n_src)
            h1 = '<span class="ms-hl">Every</span> technology headline, in one place.'
            lead = "The whole technology sector, from AI and chips to software, security, business and science, linked to the source."
        else:
            title = "%s | Tech Newswire | Moses Agentic" % ptitle
            desc = "%s Live headlines from %d sources, linked to the source." % (pdesc, n_src)
            h1 = esc(ptitle[0].upper() + ptitle[1:] + ".")
            lead = pdesc
        conf = {"bit": bit, "page": PAGE_ITEMS, "tags": [t for t in tag_list if t[0] != bit], "total": "%s headlines" % format(in_topic, ",")}
        ld = {"@context": "https://schema.org", "@type": "CollectionPage", "name": title.split(" | ")[0], "url": SITE + topic_path(key), "description": desc,
              "isPartOf": {"@type": "WebSite", "name": "Moses Agentic", "url": SITE + "/"},
              "mainEntity": {"@type": "ItemList", "itemListElement": [
                  {"@type": "ListItem", "position": i + 1, "name": r[2], "url": r[3]} for i, r in enumerate(chosen[:25])]}}
        body = site_shell.hero(f"""
  <p class="ms-k">Tech Newswire</p>
  <h1 class="ms-h1">{h1}</h1>
  <p class="ms-one">{esc(lead)}</p>
  <ul class="stats"><li><b>{n_src}</b>sources</li><li><b>{format(total, ",")}</b>headlines on the wire</li><li><b>30 min</b>between refreshes</li></ul>
""") + f"""
<div class="bar"><div class="ms-wrap">
  <nav class="chips" aria-label="Topics">{chips_for(key)}</nav>
  <div class="find"><input type="search" id="q" placeholder="Search every headline on the wire" aria-label="Search headlines" autocomplete="off"><span id="count">{conf["total"]}</span></div>
</div></div>
<main><div class="ms-wrap">
<div id="list" data-last="{chosen[-1][0] if chosen else 0}" data-day0="{esc(last_day)}" data-day="{esc(last_day)}">{body_rows or '<p class="empty">The wire is quiet here. Check back shortly.</p>'}</div>
<div class="more"><button type="button" class="ms-btn ghost" id="more"{'' if in_topic > len(chosen) else ' hidden'}>Show more headlines</button></div>
<div class="panel"><h2>Too much to read? We do the reading for you.</h2>
<p>Our news desk picks the few stories that matter to a business owner and explains each one in plain words. And if you want this kind of round-the-clock watch pointed at your own company, that is what a digital workforce does.</p>
<div class="ms-btns"><a class="ms-btn" href="/news/">Technology news for business <span aria-hidden="true">→</span></a><a class="ms-btn ghost" href="/">See what Moses Agentic does</a></div></div>
<p class="note">Times are Eastern. Headlines and excerpts belong to their publishers, and every link goes to the original story. Stock quotes by <a href="https://www.tradingview.com/" target="_blank" rel="noopener nofollow">TradingView</a>. <a href="/newswire/sources/">See all {n_src} sources</a>, or <a href="mailto:welcome@mosesagentic.com?subject=Source%20for%20the%20Tech%20Newswire">suggest one</a>.</p>
</div></main>
<script type="application/json" id="nw">{json.dumps(conf).replace("<", "\\u003c")}</script>
<script>document.addEventListener("DOMContentLoaded", function () {{{JS}}});</script>"""
        page = shell(title, desc, topic_path(key), body, ld=ld)
        target = OUT / "index.html" if key == "technology" else OUT / key / "index.html"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(page, encoding="utf-8")

    # the all-technology page used to live at /newswire/technology/; that address now sends visitors to /newswire/
    (OUT / "technology").mkdir(exist_ok=True)
    (OUT / "technology" / "index.html").write_text(
        '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>Tech Newswire | Moses Agentic</title>'
        '<link rel="canonical" href="%s/newswire/"><meta name="robots" content="noindex, follow">'
        '<meta http-equiv="refresh" content="0; url=/newswire/"></head>'
        '<body><p><a href="/newswire/">Tech Newswire</a></p></body></html>\n' % SITE, encoding="utf-8")

    # the sources page
    groups = []
    for cat, lab in CAT_LABELS:
        mine = sorted((s for s in active if s["cat"] == cat), key=lambda s: s["name"].lower())
        if mine:
            groups.append('<h2>%s (%d)</h2><ul>%s</ul>' % (esc(lab), len(mine), "".join(
                '<li><a href="%s" target="_blank" rel="noopener">%s</a></li>' % (esc(s["site"]), esc(s["name"])) for s in mine)))
    body = site_shell.hero(f"""
  <p class="ms-k">Tech Newswire</p>
  <h1 class="ms-h1">The {n_src} sources on the wire.</h1>
  <p class="ms-one">Every source publishes its own public feed. We read each one, list the headline and link straight to the publisher.</p>
""") + f"""
<main><div class="ms-wrap srcs">
{''.join(groups)}
<div class="panel"><h2>Know a source we should carry?</h2><p>If it publishes a public feed about technology, we will add it.</p>
<div class="ms-btns"><a class="ms-btn" href="mailto:welcome@mosesagentic.com?subject=Source%20for%20the%20Tech%20Newswire">Suggest a source</a><a class="ms-btn ghost" href="/newswire/">Back to the wire</a></div></div>
</div></main>"""
    (OUT / "sources").mkdir(exist_ok=True)
    (OUT / "sources" / "index.html").write_text(shell(
        "The %d sources behind the Tech Newswire | Moses Agentic" % n_src,
        "The %d technology sources the Moses Agentic Tech Newswire reads: the technology and business press, AI labs and research, chips, security and science." % n_src,
        "/newswire/sources/", body), encoding="utf-8")

    # the data file the page's search and "show more" read
    (OUT / "items.json").write_text(json.dumps({
        "v": 1, "generated": now, "read": max(last_ok.values(), default=now), "active": n_src,   # "read": when the feeds were last really read
        "topics": [[BIT[k], k, lab] for k, lab, _, _ in TOPICS],
        "src": [[s["name"], s["site"], s["feed"], last_ok.get(s["feed"], 0)] for s in sources],
        "items": rows}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # The news strip at the bottom of every page reads this: the newest headlines from across the technology sector,
    # one per source (see strip_ok: news outlets only, about technology, no reviews, deals or explainers).
    seen_src, latest = set(), []
    for r in rows:
        s = sources[r[1]]
        if r[1] not in seen_src and strip_ok(r[2], s, r[5]):
            seen_src.add(r[1])
            latest.append([r[2], s["name"]])
            if len(latest) >= 16:
                break
    (OUT / "latest.json").write_text(json.dumps({"items": latest}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # one combined feed of the whole wire
    def rfc(ts):
        return email.utils.format_datetime(dt.datetime.fromtimestamp(ts, dt.timezone.utc))
    items = "".join(
        "<item><title>%s</title><link>%s</link><guid isPermaLink=\"true\">%s</guid><pubDate>%s</pubDate><source url=\"%s\">%s</source>%s</item>\n"
        % (esc(r[2]), esc(r[3]), esc(r[3]), rfc(r[0]), esc(sources[r[1]]["feed"]), esc(sources[r[1]]["name"]),
           "<description>%s</description>" % esc(r[4]) if r[4] else "")
        for r in pick(rows, BIT["technology"])[:100])
    (OUT / "feed.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>Moses Agentic: Tech Newswire</title><link>%s/newswire/</link>'
        "<description>Technology headlines from %d sources, linked to the source.</description><language>en-us</language>"
        "<lastBuildDate>%s</lastBuildDate>\n%s</channel></rss>\n" % (SITE, n_src, rfc(int(time.time())), items), encoding="utf-8")

    # the sitemap carries the newswire pages
    sm = PUBLIC / "sitemap.xml"
    if sm.exists():
        text = sm.read_text(encoding="utf-8")
        today = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d")
        add = ""
        text = re.sub(r"\s*<url><loc>%s/newswire/technology/</loc>.*?</url>" % re.escape(SITE), "", text)
        for path in [topic_path(k) for k in TOPIC_KEYS] + ["/newswire/sources/"]:
            loc = "<loc>%s%s</loc>" % (SITE, path)
            if loc in text:
                text = re.sub(re.escape(loc) + r"<lastmod>[^<]*</lastmod>", loc + "<lastmod>%s</lastmod>" % today, text)
            else:
                add += "  <url>%s<lastmod>%s</lastmod><changefreq>hourly</changefreq><priority>%s</priority></url>\n" % (loc, today, "0.9" if path == "/newswire/" else "0.6")
        if add and "</urlset>" in text:
            text = text.replace("</urlset>", add + "</urlset>")
        sm.write_text(text, encoding="utf-8")

# ---------------------------------------------------------------------------------------------- commands


def load_sources():
    src = json.loads(SOURCES.read_text(encoding="utf-8"))
    return [s for s in src if s.get("feed") and s.get("name") and s.get("cat") in CAT_TOPICS]


def cmd_build(refresh):
    sources = load_sources()
    now = int(time.time())
    old, last_ok = load_previous(sources)
    print("sources listed:", len(sources), "| previous items:", len(old))
    rows = []
    if refresh:
        results = fetch_all(sources, budget=420)
        for i, v in results.items():
            if v[0] == "ok":
                last_ok[sources[i]["feed"]] = now
        live = sum(1 for v in results.values() if v[0] == "ok")
        rows = gather(sources, results, now)
        fails = sorted(((sources[i]["name"], v[1]) for i, v in results.items() if v[0] != "ok"), key=lambda x: x[0])
        print("feeds answered:", live, "of", len(sources), "| new rows:", len(rows))
        for name, why in fails[:40]:
            print("  no answer:", name, "|", why)
    merged = merge(rows, old, now)
    if not merged:
        sys.exit("nothing to publish: no feeds answered and no earlier items were found")
    if not last_ok:  # no record yet of which feeds answer: count the ones with a story on the wire
        last_ok = {sources[i]["feed"]: now for i in {r[1] for r in merged}}
    write_pages(merged, sources, last_ok, now)
    print("published", len(merged), "headlines from", sum(1 for v in last_ok.values() if v >= now - 7 * 86400), "sources to", OUT)


def cmd_check(cand_path, report_path):
    cands = json.loads(Path(cand_path).read_text(encoding="utf-8"))
    now = int(time.time())
    results = fetch_all(cands, budget=900)
    keep, report, seen_site = [], [], {}
    for i, c in enumerate(cands):
        status, feed = results.get(i, ("err", "no answer in time"))
        row = {"name": c["name"], "feed": c["feed"], "cat": c["cat"], "from": c.get("from", "")}
        if status != "ok":
            row["verdict"] = "failed: " + feed
            if c.get("keep") and c["name"]:
                p = urllib.parse.urlsplit(c["feed"])
                row["verdict"] = "listed although it did not answer here: " + feed
                keep.append({"name": c["name"], "feed": c["feed"], "site": "%s://%s/" % (p.scheme, p.netloc), "cat": c["cat"]})
            report.append(row)
            continue
        dated = [it for it in feed["items"] if it["ts"]]
        newest = max((it["ts"] for it in dated), default=0)
        titles = " ".join(it["title"] for it in feed["items"][:30])
        letters = [ch for ch in titles if ch.isalpha()]
        ascii_share = sum(1 for ch in letters if ch.isascii()) / max(1, len(letters))
        row.update({"items": len(feed["items"]), "newest_days": round((now - newest) / 86400, 1) if newest else None, "ascii": round(ascii_share, 2), "lang": feed["lang"]})
        name = clean(c["name"] or feed["title"], 200)[:60].strip(" -|:")
        site = feed["site"] if re.match(r"^https?://", feed["site"] or "") else ""
        p = urllib.parse.urlsplit(site or c["feed"])
        if not site or re.search(r"\.(xml|rss|atom)$|/feed/?$|/rss/?$", p.path):
            site = "%s://%s/" % (p.scheme, p.netloc)
        if not dated:
            row["verdict"] = "skipped: no dated items"
        elif now - newest > 120 * 86400:
            row["verdict"] = "skipped: nothing new in 120 days"
        elif ascii_share < 0.9 or (feed["lang"] and not feed["lang"].startswith("en")):
            row["verdict"] = "skipped: not English"
        elif not name:
            row["verdict"] = "skipped: no name"
        elif title_key(name) in seen_site and seen_site[title_key(name)] == url_key(site):
            row["verdict"] = "skipped: same name and site as another feed"
        else:
            row["verdict"] = "kept"
            seen_site[title_key(name)] = url_key(site)
            keep.append({"name": name, "feed": c["feed"], "site": site, "cat": c["cat"]})
        report.append(row)
    order = {k: i for i, (k, _) in enumerate(CAT_LABELS)}
    keep.sort(key=lambda s: (order.get(s["cat"], 99), s["name"].lower()))
    SOURCES.write_text(json.dumps(keep, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    Path(report_path).write_text(json.dumps(report, indent=1, ensure_ascii=False), encoding="utf-8")
    tally = {}
    for r in report:
        v = r["verdict"].split(":")[0]
        tally[v] = tally.get(v, 0) + 1
    print(len(cands), "candidates |", tally, "| kept", len(keep))


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "build"
    if cmd == "build":
        cmd_build(True)
    elif cmd == "reuse":
        cmd_build(False)
    elif cmd == "check":
        cmd_check(sys.argv[2], sys.argv[3])
    else:
        sys.exit("usage: newswire.py build | reuse | check <candidates.json> <report.json>")
    sys.stdout.flush()
    os._exit(0)  # feed threads still waiting on a slow server are not worth waiting for
