#!/usr/bin/env python3
"""Publish approved blog articles and news items from Airtable onto mosesagentic.com.

Run by .github/workflows/publish-blog.yml in two steps, or by hand:

  prepare   Read Content Items rows (Channel = Blog, Status = Approved, Compliance
            Check ticked, Publish Date passed) and News Items rows (Status = Approved,
            Compliance Check ticked, Post Date blank or passed, America/New_York).
            Each becomes a JSON file under content/blog/ or content/news/ and a page
            under public/blog/<slug>/ or public/news/<slug>/. Then the /blog/ and
            /news/ index pages, both RSS feeds and the sitemap are rebuilt, and a
            manifest records what was written.
  finalize  After the workflow has pushed the commit, mark those rows Published in
            Airtable (Published URL, Published At, Publish Log) and move the
            articles' linked topics to Published.
  rebuild   Re-render every page, index, feed and the sitemap from content/ (no
            Airtable). Use after a template change.

Rows that cannot be published (bad slug, unsafe HTML, too short, missing source,
bad link, a slug another row took earlier in the run) are set to Failed with the
reason in Publish Log, so nothing is retried forever. Rows whose page is already
committed on main are only marked Published.

Environment: AIRTABLE_TOKEN (required for prepare/finalize; without it the script
exits quietly), MANIFEST (path, default /tmp/publish-manifest.json), MAX_POSTS
(default 2), MAX_NEWS (default 5), GITHUB_OUTPUT (set by GitHub Actions).
Standard library only. Dates are written month first ("November 17, 2026").
"""
from __future__ import annotations

import html
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
CONTENT = ROOT / "content"
BLOG_SRC = CONTENT / "blog"
NEWS_SRC = CONTENT / "news"
IMG_DIR = PUBLIC / "assets" / "img" / "blog"
TEMPLATES = ROOT / "templates"
SITE = "https://mosesagentic.com"
SITE_NAME = "Moses Agentic"
TZ_NAME = "America/New_York"

API = os.environ.get("AIRTABLE_API_URL", "https://api.airtable.com/v0").rstrip("/")
BASE = "appeeNiWNjd9j1RQR"          # Moses Agentic Marketing
ITEMS = "tblYqCmfppoZLuRiF"         # Content Items
TOPICS = "tblafzbDktUxUNfQX"        # Content Topics
PHOTOS = "tblvTsNo2Bj5dOXPZ"        # Post Photos
NEWS = "tblg3Thdr87YlpQmu"          # News Items

# Content Items fields (by id, so renaming a column cannot break publishing)
F = {
    "title": "flditdTKcbyte98BK",
    "channel": "flduSmB0EAs50y6ne",
    "status": "fldCxNiDFE1ADBs6D",
    "publish_date": "fldoeHB4OR5x9Gd9M",
    "headline": "fldyi2ARCuD0XDHnt",
    "copy": "fldbO6QDsbWZz3fOz",
    "slug": "fldodBAo0TUhBjxsb",
    "meta_description": "fldu46r5CzRzpMJb9",
    "keyword": "fldZmbiFUHkcp1qdK",
    "image_url": "fldAcipxqG9Xkgj5F",
    "image_alt": "fldHvmQfwGEp0P2vM",
    "photo": "fldRhlx45FwrHLiim",
    "compliance": "fld0KvhZbp4XywiNA",
    "published_url": "fldISlCtqYSlc1m4g",
    "published_at": "fldX2kEIUu5QPABuH",
    "publish_log": "fldxAWITwO2IIK6DI",
    "topic": "fldfOuFnl1rXVhddL",
}
TF = {"status": "fldqP68et15L4aYod", "published_url": "fldkRycpmhlqFMOcG", "pillar": "fld7soezDkNac9LpR"}
PF = {"name": "fldR3XK3JSktnnnI5", "url": "fldYgYcguILMSi5iD", "status": "fldEB31TaXPesJupH"}
NF = {
    "title": "fldvRd7aXJqtzo6mS",
    "source": "fldZIOR2e2czO6i3q",
    "source_url": "fldlpvfwW6thb9aho",
    "article_date": "fldEb63VkxeIkZ7he",
    "category": "fldL7CHQ5UXFZ34Tf",
    "summary": "fldjPKixKwlAjsNpZ",
    "why": "fldUcewdI8DtF3zbM",
    "status": "fldmBxG3KrQCGh1I4",
    "added_by": "fldH3Be5qwXrIGdKA",
    "compliance": "fld4FttcRLMqPJKz6",
    "post_date": "fldhV6kFGbPc6DBXd",
    "slug": "fldS9qvMBMM5RpTqR",
    "published_url": "fldm7JrMtY9RQjwzG",
    "published_at": "fldUCTcCQD6vf6Xr8",
    "publish_log": "fldYAPI6KWfN1QmHz",
    "notes": "fldebvI4JGfhccW5M",
}
# Category option name in Airtable -> (key, label) on the news page
# The Airtable option names are kept as they were created; the labels shown on the page are the
# technology-news labels ownership asked for on November 17, 2026.
NEWS_CATEGORIES = {
    "AI & automation": ("ai", "AI & automation"),
    "AI for small business": ("smb", "Small business tech"),
    "AI by industry": ("industry", "Tech by industry"),
    "Agents & tools": ("tools", "Software & devices"),
    "Policy, law & data": ("policy", "Security, policy & law"),
    "Work & productivity": ("work", "Work & productivity"),
    "Company update": ("company", "Company update"),
}

DUE_FORMULA = "AND({Channel}='Blog',{Status}='Approved',{Compliance Check}=1)"
NEWS_DUE_FORMULA = "AND({Status}='Approved',{Compliance Check}=1)"

MAX_POSTS = int(os.environ.get("MAX_POSTS", "2"))
MAX_NEWS = int(os.environ.get("MAX_NEWS", "5"))
MANIFEST = Path(os.environ.get("MANIFEST", "/tmp/publish-manifest.json"))
TOKEN = os.environ.get("AIRTABLE_TOKEN", "").strip()

SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
UNSAFE_RE = re.compile(r"<\s*(script|iframe|object|embed|form|style|link|meta|svg)\b|javascript\s*:|\son[a-z]+\s*=", re.I)
TAG_RE = re.compile(r"<[^>]+>")
URL_RE = re.compile(r"^https?://[^\s<>\"'`]+$", re.I)
PATH_RE = re.compile(r"^/(?!/)[^\s<>\"'`\\]*$")
MIN_WORDS = 300
NEWS_TITLE_MAX = 160
NEWS_MIN_WORDS, NEWS_MAX_WORDS = 20, 160
IMAGE_TYPES = {"image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp"}
RESERVED_SLUGS = {"feed", "index", "archive", "assets"}
RTL = {"he", "yi", "ar"}


# ---------------------------------------------------------------- Airtable
def api(method, path, params=None, body=None):
    url = f"{API}/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    data = None
    headers = {"Authorization": f"Bearer {TOKEN}"}
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:400]
        raise RuntimeError(f"Airtable {method} {path}: HTTP {e.code} {detail}") from None
    except urllib.error.URLError as e:
        raise RuntimeError(f"Airtable {method} {path}: {e.reason}") from None


def list_records(table, formula):
    out, offset = [], None
    while True:
        params = {"filterByFormula": formula, "returnFieldsByFieldId": "true", "pageSize": "100"}
        if offset:
            params["offset"] = offset
        page = api("GET", f"{BASE}/{table}", params)
        out.extend(page.get("records", []))
        offset = page.get("offset")
        if not offset:
            return out


def get_record(table, rid):
    return api("GET", f"{BASE}/{table}/{rid}", {"returnFieldsByFieldId": "true"})


def update_record(table, rid, fields):
    return api("PATCH", f"{BASE}/{table}/{rid}", body={"fields": fields})


# ----------------------------------------------------------------- helpers
def one_line(s, limit=None):
    s = re.sub(r"\s+", " ", re.sub(r"-{2,}>", "", str(s or ""))).strip()
    return s[:limit].rstrip() if limit else s


def slugify(s, limit=80):
    """Lowercase, hyphenate, and cut at a word boundary so a long title never ends mid-word."""
    s = re.sub(r"[^a-z0-9]+", "-", str(s or "").lower()).strip("-")
    if len(s) > limit:
        s = s[:limit]
        if "-" in s:
            s = s.rsplit("-", 1)[0]
    return s.rstrip("-")


def text_of(body):
    return re.sub(r"\s+", " ", html.unescape(TAG_RE.sub(" ", body))).strip()


def plain_text(s):
    return one_line(TAG_RE.sub(" ", text_of(str(s or ""))))


def is_http_url(url):
    try:
        parts = urllib.parse.urlsplit(url)
    except ValueError:
        return False
    return bool(URL_RE.match(url)) and parts.scheme in ("http", "https") and bool(parts.netloc)


def select_name(v):
    return one_line(v.get("name") if isinstance(v, dict) else v)


def excerpt_of(body, limit=200):
    m = re.search(r"<p\b[^>]*>(.*?)</p>", body, re.I | re.S)
    source = text_of(m.group(1)) if m and text_of(m.group(1)) else text_of(re.sub(r"<h[1-6]\b[^>]*>.*?</h[1-6]>", " ", body, flags=re.I | re.S))
    out = ""
    for part in re.split(r"(?<=[.!?])\s+", source):
        if out and len(out) + len(part) + 1 > limit:
            break
        out = (out + " " + part).strip()
        if len(out) >= limit * 0.6:
            break
    return out[:limit].rstrip()


def parse_iso(s):
    s = str(s or "").strip()
    if not s:
        return None
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        d = datetime.fromisoformat(s)
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def iso_date(s):
    s = str(s or "").strip()
    if not s:
        return ""
    try:
        return date.fromisoformat(s[:10]).isoformat()
    except ValueError:
        return None


def tz():
    try:
        from zoneinfo import ZoneInfo
        return ZoneInfo(TZ_NAME)
    except Exception:
        return timezone.utc


def local_date(d):
    return d.astimezone(tz()).strftime("%Y-%m-%d")


def pretty_date(ymd):
    """'2026-11-17' -> 'November 17, 2026' (month first, always)."""
    try:
        d = date.fromisoformat(str(ymd)[:10])
    except ValueError:
        return str(ymd)
    return f"{d.strftime('%B')} {d.day}, {d.year}"


def rfc2822(ymd):
    d = datetime.combine(date.fromisoformat(str(ymd)[:10]), datetime.min.time(), tzinfo=timezone.utc).replace(hour=13)
    return d.strftime("%a, %d %b %Y %H:%M:%S +0000")


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def esc(s):
    return html.escape(str(s or ""), quote=True)


def git(*args):
    r = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)
    return r.stdout.strip()


def on_main(target):
    rel = target.relative_to(ROOT).as_posix()
    return git("ls-files", "--error-unmatch", "--", rel) == rel


def slug_conflict(slug, target, entries):
    for e in entries:
        if e["slug"] == slug:
            return f"slug {slug!r} is already used by row {e['id']} in this run; set a different Slug"
    if target.exists() and not on_main(target):
        return f"slug {slug!r} collides with {target.relative_to(ROOT).as_posix()}, which is not on main; set a different Slug"
    return None


def gh_output(**kv):
    path = os.environ.get("GITHUB_OUTPUT")
    if not path:
        return
    with open(path, "a", encoding="utf-8") as fh:
        for k, v in kv.items():
            fh.write(f"{k}={one_line(str(v))}\n")


def write_manifest(m):
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(m, indent=2), encoding="utf-8")


def read_manifest():
    if not MANIFEST.exists():
        return {"posts": [], "news": []}
    return json.loads(MANIFEST.read_text(encoding="utf-8"))


def fetch_image(url, slug):
    if not url or not str(url).lower().startswith(("http://", "https://")):
        return None, "no usable image URL"
    req = urllib.request.Request(url, headers={"User-Agent": "MosesAgenticPublisher/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            ctype = (r.headers.get("Content-Type") or "").split(";")[0].strip().lower()
            data = r.read(15 * 1024 * 1024 + 1)
    except Exception as e:
        return None, f"image download failed: {e}"
    ext = IMAGE_TYPES.get(ctype)
    if not ext:
        return None, f"image skipped: unsupported type {ctype or 'unknown'}"
    if len(data) < 20_000 or len(data) > 15 * 1024 * 1024:
        return None, f"image skipped: {len(data)} bytes"
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    dest = IMG_DIR / f"{slug}.{ext}"
    dest.write_bytes(data)
    return f"/assets/img/blog/{slug}.{ext}", f"image saved as {dest.relative_to(ROOT)} ({len(data)} bytes)"


def mark_failed(rid, reason, table=ITEMS, fields=F):
    print(f"  FAILED: {reason}")
    update_record(table, rid, {fields["status"]: "Failed", fields["publish_log"]: f"{now_iso()} {reason}"})


# ----------------------------------------------------------------- content
def load_json_dir(folder):
    items = []
    if not folder.exists():
        return items
    for p in sorted(folder.glob("*.json")):
        try:
            d = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        if d.get("status", "published") != "published":
            continue
        d.setdefault("slug", p.stem)
        items.append(d)
    return items


def tpl(name):
    return (TEMPLATES / name).read_text(encoding="utf-8")


def render(template, values):
    out = template
    for k, v in values.items():
        out = out.replace("{{" + k + "}}", v if v is not None else "")
    return re.sub(r"\{\{[a-z_]+\}\}", "", out)


def write_page(rel, text):
    dest = PUBLIC / rel.lstrip("/")
    dest.mkdir(parents=True, exist_ok=True)
    (dest / "index.html").write_text(text, encoding="utf-8")


# -------------------------------------------------------------- blog pages
def related_html(current_slug, posts, limit=3):
    others = [p for p in posts if p["slug"] != current_slug][:limit]
    if not others:
        return ""
    lis = "".join(f'<li><a href="/blog/{esc(p["slug"])}/">{esc(p["headline"])}</a></li>' for p in others)
    return f'<section class="related"><h2>More from Moses Agentic</h2><ul>{lis}</ul></section>'


def render_post(p, posts):
    url = f"{SITE}/blog/{p['slug']}/"
    lang = p.get("lang") or "en"
    image = p.get("image") or ""
    image_abs = (SITE + image) if image.startswith("/") else (image or f"{SITE}/og.png")
    tags = [t for t in p.get("tags", []) if t]
    meta = [f'<span>{esc(pretty_date(p["date"]))}</span>']
    if p.get("author"):
        meta.append(f'<span>By {esc(p["author"])}</span>')
    meta += [f'<span class="tag">{esc(t)}</span>' for t in tags[:4]]
    schema = {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": p["headline"],
        "description": p.get("description", ""),
        "datePublished": p["date"],
        "dateModified": p.get("updated") or p["date"],
        "mainEntityOfPage": url,
        "url": url,
        "inLanguage": lang,
        "author": {"@type": "Organization", "name": SITE_NAME, "url": SITE + "/"},
        "publisher": {"@type": "Organization", "name": SITE_NAME, "url": SITE + "/", "logo": {"@type": "ImageObject", "url": SITE + "/logo-full.png"}},
        "keywords": ", ".join(tags),
    }
    if image:
        schema["image"] = image_abs
    crumbs = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": SITE + "/"},
        {"@type": "ListItem", "position": 2, "name": "Insights", "item": SITE + "/blog/"},
        {"@type": "ListItem", "position": 3, "name": p["headline"], "item": url}]}
    body = p["body"]
    if "not medical, legal or financial advice" in body.lower() or "not legal, tax" in body.lower():
        disclaimer = ""
    else:
        disclaimer = '<p class="disclaimer">This article is general information for business owners, not legal, tax or financial advice. Client names and figures from our own work are kept confidential.</p>'
    page = render(tpl("post.html"), {
        "lang": lang, "dir": "rtl" if lang in RTL else "ltr",
        "title": f"{p['headline']} | {SITE_NAME}",
        "description": esc(p.get("description", "")),
        "url": url, "og_type": "article", "image_abs": esc(image_abs),
        "schema": json.dumps([schema, crumbs], ensure_ascii=False),
        "nav_blog": ' aria-current="page"', "nav_news": "",
        "kicker": "Insights", "headline": esc(p["headline"]),
        "lead_html": f'<p class="lead">{esc(p.get("excerpt", ""))}</p>' if p.get("excerpt") else "",
        "meta_html": " ".join(meta),
        "hero_img": f'<img class="hero" src="{esc(image)}" alt="{esc(p.get("image_alt", ""))}" width="1600" height="900" loading="eager">' if image else "",
        "body": body, "source_html": "", "disclaimer_html": disclaimer,
        "cta_title": "Want this working in your business?",
        "cta_text": "A free 30-minute consultation shows where a digital workforce fits your team, your paperwork and your customers. No agency fees, no jargon.",
        "related_html": related_html(p["slug"], posts),
        "year": str(datetime.now(tz()).year),
    })
    write_page(f"/blog/{p['slug']}/", page)
    return url


def render_blog_index(posts):
    cards = []
    for p in posts:
        cards.append(
            f'<article class="card"><span class="cat">{esc((p.get("tags") or ["Insights"])[0])}</span>'
            f'<h2><a href="/blog/{esc(p["slug"])}/">{esc(p["headline"])}</a></h2>'
            f'<p>{esc(p.get("excerpt") or p.get("description", ""))}</p>'
            f'<div class="foot"><span>{esc(pretty_date(p["date"]))}</span><a href="/blog/{esc(p["slug"])}/">Read</a></div></article>')
    items_html = f'<div class="grid">{"".join(cards)}</div>' if cards else '<p class="empty">The first articles are on their way.</p>'
    schema = {"@context": "https://schema.org", "@type": "CollectionPage", "name": "Insights", "url": SITE + "/blog/",
              "isPartOf": {"@type": "WebSite", "name": SITE_NAME, "url": SITE + "/"},
              "mainEntity": {"@type": "ItemList", "itemListElement": [
                  {"@type": "ListItem", "position": i + 1, "url": f"{SITE}/blog/{p['slug']}/", "name": p["headline"]} for i, p in enumerate(posts[:50])]}}
    page = render(tpl("list.html"), {
        "title": f"Insights: a digital workforce for your business | {SITE_NAME}",
        "description": "Plain-language articles on putting a digital workforce to work in a real business: by department, by industry, and with the numbers that matter.",
        "url": SITE + "/blog/", "feed_title": "Moses Agentic: Insights", "feed_path": "/feed.xml",
        "schema": json.dumps(schema, ensure_ascii=False),
        "nav_blog": ' aria-current="page"', "nav_news": "",
        "kicker": "Insights", "headline": "A digital workforce for your business, in plain words.",
        "lead": "What a digital worker can take off your team's plate, how to start safely, and what we have seen work across real estate, healthcare, finance, back office and more.",
        "chips_html": "", "items_html": items_html,
        "share_html": '<div class="share">Want to talk through any of this for your own business? <a href="/">Book a free consultation</a>.</div>',
        "year": str(datetime.now(tz()).year),
    })
    write_page("/blog/", page)
    write_feed(PUBLIC / "feed.xml", "Moses Agentic: Insights", SITE + "/blog/",
               "Plain-language articles on putting a digital workforce to work in a real business.",
               [(p["headline"], f"{SITE}/blog/{p['slug']}/", p.get("description") or p.get("excerpt", ""), p["date"]) for p in posts[:20]])


# -------------------------------------------------------------- news pages
def render_news_item(n, items):
    url = f"{SITE}/news/{n['slug']}/"
    key, label = NEWS_CATEGORIES.get(n["category_name"], ("ai", n["category_name"]))
    schema = {
        "@context": "https://schema.org", "@type": "NewsArticle", "headline": n["title"],
        "description": n["summary"][:300], "datePublished": n["date"], "url": url, "mainEntityOfPage": url,
        "author": {"@type": "Organization", "name": SITE_NAME}, "publisher": {"@type": "Organization", "name": SITE_NAME, "url": SITE + "/"},
        "isBasedOn": n["source_url"] if n["source_url"].startswith("http") else SITE + n["source_url"],
        "articleSection": label,
    }
    body = f"<p>{esc(n['summary'])}</p>"
    if n.get("why"):
        body += f'<p><strong>Why it matters:</strong> {esc(n["why"])}</p>'
    src_label = n.get("source") or SITE_NAME
    src_url = n["source_url"]
    source_html = (f'<p class="source">Read the original at <a href="{esc(src_url)}" rel="noopener" target="_blank">{esc(src_label)}</a>.</p>'
                   if src_url.startswith("http") else f'<p class="source">Read more: <a href="{esc(src_url)}">{esc(src_label)}</a>.</p>')
    others = [x for x in items if x["slug"] != n["slug"]][:3]
    related = ""
    if others:
        related = '<section class="related"><h2>More Technology news for business</h2><ul>' + "".join(
            f'<li><a href="/news/{esc(x["slug"])}/">{esc(x["title"])}</a></li>' for x in others) + "</ul></section>"
    meta = [f'<span>{esc(pretty_date(n["date"]))}</span>', f'<span class="tag">{esc(label)}</span>']
    if n.get("article_date"):
        meta.append(f'<span>Published by {esc(src_label)} on {esc(pretty_date(n["article_date"]))}</span>')
    page = render(tpl("post.html"), {
        "lang": "en", "dir": "ltr",
        "title": f"{n['title']} | Technology news for business | {SITE_NAME}",
        "description": esc(n["summary"][:155]),
        "url": url, "og_type": "article", "image_abs": f"{SITE}/og.png",
        "schema": json.dumps(schema, ensure_ascii=False),
        "nav_blog": "", "nav_news": ' aria-current="page"',
        "kicker": "Technology news for business", "headline": esc(n["title"]),
        "lead_html": "", "meta_html": " ".join(meta), "hero_img": "",
        "body": body, "source_html": source_html,
        "disclaimer_html": '<p class="disclaimer">Summaries are written in our own words from the source linked above. This is news, not legal, tax or financial advice.</p>',
        "cta_title": "What would this mean for your business?",
        "cta_text": "We put a digital workforce to work in real companies every day. A free 30-minute consultation shows where it fits yours.",
        "related_html": related,
        "year": str(datetime.now(tz()).year),
    })
    write_page(f"/news/{n['slug']}/", page)
    return url


def render_news_index(items):
    chips = ['<a href="/news/" aria-current="true">All</a>'] + [
        f'<a href="/news/#{key}">{esc(label)}</a>' for key, label in NEWS_CATEGORIES.values()]
    groups, order = {}, []
    for n in items:
        m = n["date"][:7]
        if m not in groups:
            groups[m] = []
            order.append(m)
        groups[m].append(n)
    parts = []
    for m in order:
        label = pretty_date(m + "-01").split(" ")
        parts.append(f'<h2 class="month">{esc(label[0] + " " + label[2])}</h2><div class="grid">')
        for n in groups[m]:
            key, cat = NEWS_CATEGORIES.get(n["category_name"], ("ai", n["category_name"]))
            src = n.get("source") or SITE_NAME
            parts.append(
                f'<article class="card" id="{esc(n["slug"])}" data-cat="{key}"><span class="cat">{esc(cat)}</span>'
                f'<h2><a href="/news/{esc(n["slug"])}/">{esc(n["title"])}</a></h2>'
                f'<p>{esc(n["summary"])}</p>'
                + (f'<p class="why">Why it matters: {esc(n["why"])}</p>' if n.get("why") else "")
                + f'<div class="foot"><span>{esc(pretty_date(n["date"]))} · {esc(src)}</span>'
                + (f'<a href="{esc(n["source_url"])}" rel="noopener" target="_blank">Source</a>' if n["source_url"].startswith("http") else "")
                + "</div></article>")
        parts.append("</div>")
    items_html = "".join(parts) if items else '<p class="empty">The news desk opens shortly.</p>'
    schema = {"@context": "https://schema.org", "@type": "CollectionPage", "name": "Technology news for business", "url": SITE + "/news/",
              "isPartOf": {"@type": "WebSite", "name": SITE_NAME, "url": SITE + "/"}}
    page = render(tpl("list.html"), {
        "title": f"Technology news for business | {SITE_NAME}",
        "description": "A daily desk of reputable technology news, summarized for business owners: what changed and why it matters.",
        "url": SITE + "/news/", "feed_title": "Moses Agentic: Technology news for business", "feed_path": "/news/feed.xml",
        "schema": json.dumps(schema, ensure_ascii=False),
        "nav_blog": "", "nav_news": ' aria-current="page"',
        "kicker": "Technology news for business", "headline": "What changed in technology this week, and why it matters to your business.",
        "lead": "Reputable sources, summarized in plain words for owners and operators. Updated most days.",
        "chips_html": f'<div class="chips">{"".join(chips)}</div>',
        "items_html": items_html,
        "share_html": '<div class="share">Saw an article worth sharing with other business owners? <a href="mailto:welcome@mosesagentic.com?subject=Article%20for%20the%20news%20desk">Email it to the desk</a>.</div>',
        "year": str(datetime.now(tz()).year),
    })
    write_page("/news/", page)
    write_feed(PUBLIC / "news" / "feed.xml", "Moses Agentic: Technology news for business", SITE + "/news/",
               "Reputable technology news, summarized for business owners.",
               [(n["title"], f"{SITE}/news/{n['slug']}/", n["summary"], n["date"]) for n in items[:20]])


# ------------------------------------------------------------ feeds, sitemap
def write_feed(dest, title, link, desc, entries):
    items = "".join(
        f"<item><title>{esc(t)}</title><link>{esc(u)}</link><guid>{esc(u)}</guid><pubDate>{rfc2822(d)}</pubDate><description>{esc(s)}</description></item>"
        for t, u, s, d in entries)
    xml = ('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>'
           f'<title>{esc(title)}</title><link>{esc(link)}</link><description>{esc(desc)}</description><language>en-us</language>'
           f'<atom:link href="{esc(SITE + "/" + dest.relative_to(PUBLIC).as_posix())}" rel="self" type="application/rss+xml"/>'
           f"{items}</channel></rss>\n")
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(xml, encoding="utf-8")


def update_sitemap(posts, items):
    """Keep every URL the site build already lists; add or refresh the blog and news URLs."""
    path = PUBLIC / "sitemap.xml"
    existing = []
    if path.exists():
        for m in re.finditer(r"<url>(.*?)</url>", path.read_text(encoding="utf-8"), re.S):
            loc = re.search(r"<loc>(.*?)</loc>", m.group(1))
            if loc and "/blog/" not in loc.group(1) and "/news/" not in loc.group(1):
                existing.append(m.group(0))
    today = datetime.now(tz()).strftime("%Y-%m-%d")
    rows = list(existing)
    rows.append(f"  <url><loc>{SITE}/blog/</loc><lastmod>{today}</lastmod><priority>0.7</priority></url>")
    rows += [f"  <url><loc>{SITE}/blog/{p['slug']}/</loc><lastmod>{p.get('updated') or p['date']}</lastmod><priority>0.6</priority></url>" for p in posts]
    rows.append(f"  <url><loc>{SITE}/news/</loc><lastmod>{today}</lastmod><priority>0.6</priority></url>")
    rows += [f"  <url><loc>{SITE}/news/{n['slug']}/</loc><lastmod>{n['date']}</lastmod><priority>0.4</priority></url>" for n in items]
    path.write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                    + "\n".join("  " + r.strip() for r in rows) + "\n</urlset>\n", encoding="utf-8")


def rebuild():
    posts = sorted(load_json_dir(BLOG_SRC), key=lambda p: p["date"], reverse=True)
    items = sorted(load_json_dir(NEWS_SRC), key=lambda n: (n["date"], n["slug"]), reverse=True)
    for p in posts:
        render_post(p, posts)
    render_blog_index(posts)
    for n in items:
        render_news_item(n, items)
    render_news_index(items)
    update_sitemap(posts, items)
    print(f"rebuilt {len(posts)} article(s) and {len(items)} news item(s)")
    return 0


# ------------------------------------------------------------ prepare: blog
def prepare_one(rec, due_at, manifest):
    rid, f = rec["id"], rec.get("fields", {})
    headline = one_line(f.get(F["headline"]) or f.get(F["title"]), 120)
    headline = re.sub(r"\s*\|\s*Moses Agentic\s*$", "", headline).strip()
    print(f"- {rid}: {headline or '(no headline)'}")
    if not headline:
        return mark_failed(rid, "no Headline or Title")

    slug = str(f.get(F["slug"]) or "").strip().lower()
    if not SLUG_RE.match(slug):
        slug = slugify(slug or headline)
    if not SLUG_RE.match(slug) or slug in RESERVED_SLUGS:
        return mark_failed(rid, f"cannot make a valid slug from {slug!r}")
    url = f"{SITE}/blog/{slug}/"
    target = BLOG_SRC / f"{slug}.json"
    topics = list(f.get(F["topic"]) or [])

    conflict = slug_conflict(slug, target, manifest["posts"])
    if conflict:
        return mark_failed(rid, conflict)
    if target.exists():
        print(f"  {target.relative_to(ROOT)} is already on main; the row will be marked Published")
        manifest["posts"].append({"id": rid, "slug": slug, "headline": headline, "url": url, "files": [], "topics": topics,
                                  "log": f"{now_iso()} {target.relative_to(ROOT)} was already on main; row marked Published by the publisher workflow"})
        return

    body = str(f.get(F["copy"]) or "").strip()
    words = len(text_of(body).split())
    if words < MIN_WORDS:
        return mark_failed(rid, f"Copy has {words} words; the minimum is {MIN_WORDS}")
    if UNSAFE_RE.search(body):
        return mark_failed(rid, "Copy contains scripts, iframes, forms, style, link, meta or svg tags, or event handlers")
    body = re.sub(r"<(/?)h1\b", r"<\1h2", body, flags=re.I)

    image_path, image_log, src = None, "no image", None
    photo_ids = list(f.get(F["photo"]) or [])
    if photo_ids:
        try:
            p = get_record(PHOTOS, photo_ids[0]).get("fields", {})
            if select_name(p.get(PF["status"])) == "Approved":
                src = p.get(PF["url"])
            else:
                image_log = "linked photo is not Approved; no image"
        except RuntimeError as e:
            image_log = f"photo lookup failed: {e}"
    if not src and f.get(F["image_url"]):
        src = f.get(F["image_url"])
    if src:
        image_path, image_log = fetch_image(src, slug)

    tags, kw = [], one_line(f.get(F["keyword"]), 60)
    for tid in topics[:1]:
        try:
            pillar = select_name(get_record(TOPICS, tid).get("fields", {}).get(TF["pillar"]))
            if pillar:
                tags.append(pillar)
        except RuntimeError:
            pass
    if kw:
        tags.append(kw.lower())
    tags = list(dict.fromkeys(t for t in tags if t))

    desc = one_line(f.get(F["meta_description"]), 160) or excerpt_of(body, 155)
    post = {
        "slug": slug, "headline": headline, "description": desc, "excerpt": excerpt_of(body),
        "date": local_date(due_at), "author": SITE_NAME, "lang": "en",
        "image": image_path or "", "image_alt": one_line(f.get(F["image_alt"]), 160) or headline,
        "tags": tags, "keyword": kw, "status": "published", "airtable_id": rid, "body": body,
    }
    BLOG_SRC.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(post, ensure_ascii=False, indent=1), encoding="utf-8")

    files = [str(target.relative_to(ROOT)), f"public/blog/{slug}/index.html"]
    if image_path:
        files.append("public" + image_path)
    manifest["posts"].append({"id": rid, "slug": slug, "headline": headline, "url": url, "files": files, "topics": topics,
                              "log": f"{now_iso()} files: {', '.join(files)}; {image_log}; {words} words"})
    print(f"  wrote {files[0]} ({words} words); {image_log}")


def prepare_blog(manifest):
    rows = list_records(ITEMS, DUE_FORMULA)
    now = datetime.now(timezone.utc)
    due = []
    for r in rows:
        d = parse_iso(r.get("fields", {}).get(F["publish_date"]))
        if d is None:
            print(f"- {r['id']}: no Publish Date, skipped")
        elif d > now:
            print(f"- {r['id']}: due {d.isoformat()}, not yet")
        else:
            due.append((d, r))
    due.sort(key=lambda x: x[0])
    print(f"{len(rows)} approved blog row(s), {len(due)} due, publishing up to {MAX_POSTS}")
    for d, r in due[:MAX_POSTS]:
        prepare_one(r, d, manifest)


# ------------------------------------------------------------ prepare: news
def prepare_news_one(rec, post_date, manifest):
    rid, f = rec["id"], rec.get("fields", {})
    fail = lambda reason: mark_failed(rid, reason, NEWS, NF)  # noqa: E731
    title = plain_text(f.get(NF["title"]))
    print(f"- {rid}: {title or '(no title)'}")

    raw = "\n".join(str(f.get(NF[k]) or "") for k in ("title", "source", "source_url", "summary", "why"))
    if UNSAFE_RE.search(raw) or UNSAFE_RE.search(html.unescape(raw)):
        return fail("fields contain scripts, iframes, forms, style or link tags, or event handlers")
    if not 1 <= len(title) <= NEWS_TITLE_MAX:
        return fail(f"Title is {len(title)} characters after stripping HTML; it must be 1 to {NEWS_TITLE_MAX}")
    category_name = select_name(f.get(NF["category"]))
    if category_name not in NEWS_CATEGORIES:
        return fail(f"Category {category_name!r} is not one of: {', '.join(NEWS_CATEGORIES)}")
    community = category_name == "Company update"
    source = plain_text(f.get(NF["source"]))
    if not source and not community:
        return fail("Source is required (only a Company update may leave it blank)")
    source_url = one_line(f.get(NF["source_url"]))
    if not (is_http_url(source_url) or (community and PATH_RE.match(source_url))):
        return fail(f"Source URL {source_url!r} must be a full http:// or https:// link" + (" (or / for a page on this site)" if community else ""))
    summary = plain_text(f.get(NF["summary"]))
    words = len(summary.split())
    if not NEWS_MIN_WORDS <= words <= NEWS_MAX_WORDS:
        return fail(f"Summary has {words} words; it must have {NEWS_MIN_WORDS} to {NEWS_MAX_WORDS}")
    article_date = iso_date(f.get(NF["article_date"]))
    if article_date is None:
        return fail(f"Article Date {f.get(NF['article_date'])!r} is not a date")
    why = re.sub(r"^\s*why it matters:\s*", "", plain_text(f.get(NF["why"])), flags=re.I)

    slug = str(f.get(NF["slug"]) or "").strip().lower()
    if not SLUG_RE.match(slug):
        slug = slugify(f"{post_date} {title}", 64)
    if not SLUG_RE.match(slug) or slug in RESERVED_SLUGS:
        return fail(f"cannot make a valid slug from {title!r}")
    url = f"{SITE}/news/{slug}/"
    target = NEWS_SRC / f"{slug}.json"

    conflict = slug_conflict(slug, target, manifest["news"])
    if conflict:
        return fail(conflict)
    if target.exists():
        print(f"  {target.relative_to(ROOT)} is already on main; the row will be marked Published")
        manifest["news"].append({"id": rid, "slug": slug, "title": title, "url": url, "files": [],
                                 "log": f"{now_iso()} {target.relative_to(ROOT)} was already on main; row marked Published by the publisher workflow"})
        return

    item = {"slug": slug, "title": title, "source": source, "source_url": source_url, "date": post_date,
            "article_date": article_date, "category_name": category_name, "summary": summary, "why": why,
            "status": "published", "airtable_id": rid}
    NEWS_SRC.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(item, ensure_ascii=False, indent=1), encoding="utf-8")
    files = [str(target.relative_to(ROOT)), f"public/news/{slug}/index.html"]
    manifest["news"].append({"id": rid, "slug": slug, "title": title, "url": url, "files": files,
                             "log": f"{now_iso()} files: {files[0]}; {words} words; {category_name}"})
    print(f"  wrote {files[0]} ({words} words, {category_name})")


def prepare_news(manifest):
    rows = list_records(NEWS, NEWS_DUE_FORMULA)
    today = local_date(datetime.now(timezone.utc))
    due = []
    for r in rows:
        raw = r.get("fields", {}).get(NF["post_date"])
        d = iso_date(raw)
        if d is None:
            mark_failed(r["id"], f"Post Date {raw!r} is not a date", NEWS, NF)
        elif d > today:
            print(f"- {r['id']}: Post Date {d}, not yet")
        else:
            due.append((d or today, r))
    due.sort(key=lambda x: x[0])
    print(f"{len(rows)} approved news row(s), {len(due)} due, publishing up to {MAX_NEWS}")
    for d, r in due[:MAX_NEWS]:
        prepare_news_one(r, d, manifest)


def prepare():
    manifest = {"prepared_at": now_iso(), "posts": [], "news": []}
    if not TOKEN:
        print("AIRTABLE_TOKEN is not set; nothing to publish.")
        write_manifest(manifest)
        gh_output(count=0, finalize=0, commit_message="", headlines="")
        return 0
    prepare_blog(manifest)
    prepare_news(manifest)
    written = [p for p in manifest["posts"] if p["files"]]
    news_written = [n for n in manifest["news"] if n["files"]]
    if written or news_written:
        rebuild()
    write_manifest(manifest)
    heads = [p["headline"] for p in written]
    parts = []
    if heads:
        parts.append(f"Blog: {heads[0]}" if len(heads) == 1 else f"Blog: {len(heads)} articles ({'; '.join(heads)})")
    if news_written:
        parts.append(f"News: {len(news_written)} item" + ("" if len(news_written) == 1 else "s"))
    total = len(manifest["posts"]) + len(manifest["news"])
    gh_output(count=len(written) + len(news_written), finalize=total,
              commit_message="; ".join(parts)[:200], headlines="; ".join(heads))
    print(f"{len(written)} article(s) and {len(news_written)} news item(s) written; "
          f"{total - len(written) - len(news_written)} already on main; manifest {MANIFEST}")
    return 0


# ---------------------------------------------------------------- finalize
def finalize():
    if not TOKEN:
        print("AIRTABLE_TOKEN is not set; nothing to finalize.")
        return 0
    manifest = read_manifest()
    posts, news = manifest.get("posts", []), manifest.get("news", [])
    if not posts and not news:
        print("nothing to finalize")
        return 0
    sha = git("rev-parse", "--short", "HEAD") or "unknown"
    errors = 0
    for p in posts:
        try:
            update_record(ITEMS, p["id"], {F["status"]: "Published", F["published_url"]: p["url"], F["published_at"]: now_iso(),
                                           F["publish_log"]: f"{p['log']}; commit {sha}; published by GitHub Actions"})
            for tid in p.get("topics") or []:
                update_record(TOPICS, tid, {TF["status"]: "Published", TF["published_url"]: p["url"]})
            print(f"- {p['headline']}: Published at {p['url']}")
        except RuntimeError as e:
            errors += 1
            print(f"- {p['headline']}: Airtable update failed: {e}")
    for n in news:
        try:
            update_record(NEWS, n["id"], {NF["status"]: "Published", NF["published_url"]: n["url"], NF["published_at"]: now_iso(),
                                          NF["publish_log"]: f"{n['log']}; commit {sha}; published by GitHub Actions"})
            print(f"- {n['title']}: Published at {n['url']}")
        except RuntimeError as e:
            errors += 1
            print(f"- {n['title']}: Airtable update failed: {e}")
    return 1 if errors else 0


def main(argv):
    cmd = argv[1] if len(argv) > 1 else ""
    if cmd == "prepare":
        return prepare()
    if cmd == "finalize":
        return finalize()
    if cmd == "rebuild":
        return rebuild()
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
