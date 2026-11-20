"""Second pass over scripts/newswire_sources.json after `newswire.py check`: drops off-topic and duplicate feeds from the
imported public lists, gives sources readable names and puts a few in a better category.

Usage: python3 -I curate.py <newswire_sources.json>
"""
import json
import re
import sys
import urllib.parse

path = sys.argv[1]
src = json.load(open(path, encoding="utf-8"))

# feeds dropped by address: video channels, general podcasts, and copies of feeds already on the list
DROP_FEED = re.compile(
    r"(youtube\.com/feeds/|feeds\.twit\.tv|relay\.fm/|libsyn\.com|anchor\.fm|podcasts\.files\.bbci\.co\.uk|feeds\.npr\.org/510308|feeds\.wnyc\.org|"
    r"atp\.fm|tedcdn\.com|tedtalks|twis\.org|cynicaldeveloper|codenewbie|ProgrammingThrowdown|simplecast\.com/(dLRotFGk|gvtxUiIf|LpAGSLnY|y1LF_sn2)|"
    r"feeds\.feedburner\.com/(TechCrunch|venturebeat|blogspot/hsDu|blogspot/androiddevelopersbackstage|entrepreneur|PsychologyBlog|scotthyoung|seomoz|osxdaily|fastcompany)|"
    r"feeds2\.feedburner\.com/SmallBusinessTrends|theregister\.com/headlines\.rss|deepmind\.com/blog/feed/basic|code\.facebook\.com|blog\.jetbrains\.com/blog/feed|"
    r"//arxiv\.org/rss/|machinelearningmastery\.com/blog/feed|aws\.amazon\.com/blogs/ai/feed|airesources\.blogspot|computational-intelligence\.blogspot|"
    r"data-flair\.training|nactem\.ac\.uk|provalisresearch|yseop\.com|inc\.com/rss|startupjunkie|fs\.blog|guykawasaki|harvardbusiness|nesslabs|"
    r"all-about-psychology|socialpsychology\.org|coffeeandjunk|socialmediaexaminer|backlinko|sciencedaily\.com/rss/mind_brain|lifehacker\.com|cyanogenmods|"
    r"news\.ycombinator\.com/rss|blog\.hubspot\.com|grammarly\.com/blog|shopifyengineering\.myshopify|medium\.com/feed/pinterest-engineering|rss\.sciam\.com|"
    r"marco\.org/rss|blog\.pragmaticengineer\.com|pytorch\.org/feed$|davidwalsh\.name/feed|epoch\.ai/atom\.xml)", re.I)

# readable names (keyed by the name the feed gave itself) and, where useful, a better category
RENAME = {
    "AI Weekly — AI News & Updates": ("AI Weekly", None),
    "Becoming Human: Artificial Intelligence Magazine - Medium": ("Becoming Human", None),
    "Blog - Singularity Weblog": ("Singularity Weblog", "safety"),
    "Blog | DataRobot": ("DataRobot", "labs"),
    "neural network – Hackaday": ("Hackaday: Neural networks", None),
    "Marketing AI Institute | Blog": ("Marketing AI Institute", None),
    "John D. Cook": ("John D. Cook", "dev"),
    "The Intercom Blog": ("Intercom", None),
    "Hacker News: Launches": ("Hacker News: Launches", "community"),
    "Hacker News: Show HN": ("Hacker News: Show HN", "community"),
    "MIT News": ("MIT News: Research", "research"),
    "MIT News - Science, Technology, and Society | Technology and": ("MIT News: Science, technology and society", "policy"),
    "ScienceAlert": ("ScienceAlert", "sci"),
    "SlashGear - Tech, Cars, Gaming, Science, & Reviews": ("SlashGear", "tech"),
    "Steve Blank": ("Steve Blank", "biz"),
    "Commonplace - The Commoncog Blog": ("Commoncog", "biz"),
    "Articles on Smashing Magazine — For Web Designers And Develo": ("Smashing Magazine", None),
    "Dan Abramov's Overreacted Blog RSS Feed": ("Overreacted (Dan Abramov)", None),
    "Engineering – The GitHub Blog": ("GitHub Engineering", None),
    "Etsy Engineering | Code as Craft": ("Etsy: Code as Craft", None),
    "Flurries of latent creativity - Stripe CTO blog": ("David Singleton", None),
    "Latest News - Apple Developer": ("Apple Developer News", None),
    "Martin Kleppmann's blog": ("Martin Kleppmann", None),
    "Medium Engineering - Medium": ("Medium Engineering", None),
    "NN/g latest articles and announcements": ("Nielsen Norman Group", None),
    "Podcast Archives - Software Engineering Daily": ("Software Engineering Daily", None),
    "ProAndroidDev - Medium": ("ProAndroidDev", None),
    "Software Engineering Radio - The Podcast for Professional So": ("Software Engineering Radio", None),
    "The Airbnb Tech Blog - Medium": ("Airbnb Engineering", None),
    "The Airtable Engineering Blog": ("Airtable Engineering", None),
    "The One And Only Blog Of Joe Fabisevich": ("Joe Fabisevich", None),
    "The singularity is nearer": ("George Hotz", "ainews"),
    "UX Collective - Medium": ("UX Collective", None),
    "UX Daily - User Experience Daily": ("Interaction Design Foundation", None),
    "Josh Comeau's blog": ("Josh Comeau", None),
    "Scott Hanselman's Blog": ("Scott Hanselman", None),
    "Signal Blog": ("Signal", None),
    "Eric Jang": ("Eric Jang", "ainews"),
    "Magenta": ("Google Magenta", "research"),
    "Two Minute Papers": ("Two Minute Papers", "ainews"),
    "Android": ("Google: Android", "bigtech"),
    "AppleInsider News": ("AppleInsider", None),
    "Droid Life – Opinionated Android news.": ("Droid Life", None),
    "GSMArena.com - Latest articles": ("GSMArena", None),
    "iMore - The #1 iPhone, iPad, and iPod touch blog": ("iMore", None),
    "Latest from Android Central": ("Android Central", None),
    "Latest Science News -- ScienceDaily": ("ScienceDaily", None),
    "New Scientist - Space": ("New Scientist: Space", None),
    "Phys.org - latest science and technology news stories": ("Phys.org", None),
    "Space | The Guardian": ("The Guardian: Space", None),
    "Google DeepMind (blog.google)": ("Google: DeepMind updates", None),
    "OpenAI (community feed)": ("OpenAI: Research", None),
    "Lex Fridman Podcast": ("Lex Fridman Podcast", "policy"),
}


def key(name):
    return re.sub(r"[^a-z0-9]+", "", name.lower())


out, seen, dropped = [], set(), []
for s in src:
    if DROP_FEED.search(s["feed"]):
        dropped.append(s["name"])
        continue
    if s["name"] in RENAME:
        name, cat = RENAME[s["name"]]
        s["name"] = name
        if cat:
            s["cat"] = cat
    s["name"] = re.sub(r"\s+(-|–|—|\|)\s+Medium$", "", s["name"]).strip()
    k = key(s["name"])
    if not k or k in seen:
        dropped.append(s["name"] + " (same name)")
        continue
    seen.add(k)
    out.append(s)

order = ["labs", "research", "ainews", "safety", "policy", "chips", "biz", "sec", "dev", "tech", "bigtech", "sci", "community"]
out.sort(key=lambda s: (order.index(s["cat"]), s["name"].lower()))
json.dump(out, open(path, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
open(path, "a", encoding="utf-8").write("\n")
print("kept", len(out), "| dropped", len(dropped))
odd = [s for s in out if len(s["name"]) < 4 or re.search(r"(\||–|—| - |RSS|feed|blog$)", s["name"], re.I)]
for s in odd:
    print("  look:", s["cat"], "|", s["name"], "|", urllib.parse.urlsplit(s["feed"]).netloc + urllib.parse.urlsplit(s["feed"]).path[:50])
