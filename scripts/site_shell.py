"""The front page's header, moving-dot hero, bottom menu and footer, as HTML, for the pages the site's scripts
generate: Insights and Technology news (scripts/publish_from_airtable.py with templates/) and the Tech Newswire
(scripts/newswire.py). Styles: /vendor/site-header.css (header and moving dots) and /vendor/site-shell.css (the rest).
Behaviour: /vendor/site-shell.js. The checkout page uses HEADER (no ticker) with site-header.css only.

Ownership, November 20, 2026: "No page on the site should look different from the front page."

The bottom menu's links open the front page at a section: /?go=v2-dw and so on, handled by the front page's script.
"""

FONTS = ("https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800"
         "&family=Instrument+Serif:ital@0;1&display=swap")

# everything a page needs in <head>, after its own <title> and meta tags
HEAD = (
    '<link rel="icon" href="/favicon.svg" type="image/svg+xml">\n'
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png">\n'
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
    '<link rel="stylesheet" href="' + FONTS + '">\n'
    '<link rel="stylesheet" href="/vendor/site-header.css">\n'
    '<link rel="stylesheet" href="/vendor/site-shell.css">\n'
    '<link rel="stylesheet" href="/vendor/site-ticker.css">\n'
    '<script src="/vendor/site-shell.js" defer></script>\n'
    '<script src="/vendor/site-ticker.js" defer></script>'
)

GLOBE = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">'
         '<circle cx="12" cy="12" r="10"></circle><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"></path></svg>')
LOCK = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>')
PIN = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
       '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"></path><circle cx="12" cy="9.5" r="2.5"></circle></svg>')

# the stock ticker band
TICKER = (
    '<div class="site-ticker" id="site-ticker" aria-label="Technology sector stocks"></div>'
    '<script>document.documentElement.classList.add("has-ticker")</script>'
)

# the header (logo, EN and globe, Team)
HEADER = (
    '<header class="top ms-top"><div class="ms-wrap">\n'
    '  <a class="ms-brand" href="/" aria-label="Moses Agentic home"><img src="/logo-full.png" alt="Moses Agentic" width="1088" height="216"></a>\n'
    '  <div class="ms-langs" role="group" aria-label="Language">'
    '<button type="button" lang="en" aria-pressed="true">EN</button>'
    '<button type="button" class="globe" data-ms-langs aria-haspopup="true" aria-expanded="false" aria-label="More languages" title="More languages">' + GLOBE + '</button>'
    '<div class="ms-langmenu" id="ms-langmenu" hidden>'
    '<a href="#" aria-current="true" onclick="document.getElementById(\'ms-langmenu\').hidden=true;return false">English <span>this page</span></a>'
    '<a href="/#es" lang="es">Español <span>home</span></a>'
    '<a href="/#yi" lang="yi" dir="rtl">אידיש <span>home</span></a>'
    '<a href="/#he" lang="he" dir="rtl">עברית <span>home</span></a>'
    '</div></div>\n'
    '  <a class="ms-team" href="https://airtable.com/appzqMaRLQZQDcAMU" target="_blank" rel="noopener" title="Team prospect tracker" aria-label="Team prospect tracker">' + LOCK + '<span>Team</span></a>\n'
    '</div></header>'
)

# the first thing in <body> on the content pages
TOP = TICKER + "\n" + HEADER

# the hero: the front page's moving dots behind the page's title block
FX = '<canvas class="ms-fx" aria-hidden="true"></canvas>'


def hero(inner):
    return '<section class="ms-hero">' + FX + '<div class="ms-in">' + inner + '</div></section>'


IC = {
    "home": '<svg viewBox="0 0 48 48"><circle cx="15" cy="24" r="7"/><circle cx="24" cy="24" r="9"/><circle cx="33" cy="24" r="7"/></svg>',
    "dw": '<svg viewBox="0 0 48 48"><circle cx="17" cy="18" r="9"/><circle cx="31" cy="20" r="7"/><circle cx="24" cy="31" r="10"/><circle class="g" cx="38" cy="34" r="4"/></svg>',
    "ms": '<svg viewBox="0 0 48 48"><rect x="8" y="10" width="32" height="22" rx="7"/><rect x="18" y="34" width="12" height="5" rx="2.5"/><circle class="g" cx="38" cy="12" r="5"/></svg>',
    "sol": '<svg viewBox="0 0 48 48"><circle cx="24" cy="11" r="6"/><circle cx="11" cy="24" r="6"/><circle cx="37" cy="24" r="6"/><circle class="g" cx="24" cy="37" r="6"/></svg>',
    "ac": '<svg viewBox="0 0 48 48"><path d="M24 9 44 19 24 29 4 19z"/><path d="M13 25v8c3 4 19 4 22 0v-8l-11 6z"/><circle class="g" cx="42" cy="30" r="3.5"/></svg>',
    "pr": '<svg viewBox="0 0 48 48"><path d="M8 10h17l15 15a4 4 0 0 1 0 6L30 41a4 4 0 0 1-6 0L8 26z"/><circle class="w" cx="17" cy="19" r="4"/></svg>',
}

# the bottom menu: the same six entries as the front page, opening the front page at that section
DOCK = (
    '<nav class="v2dock" id="v2dock" aria-label="Sections">'
    + "".join('<a href="%s"%s><span class="v2ic" aria-hidden="true">%s</span>%s</a>' % (href, cls, IC[ic], label) for href, cls, ic, label in [
        ("/", "", "home", "Home"),
        ("/?go=v2-dw", "", "dw", "Digital Workforce"),
        ("/?go=v2-ms", "", "ms", "Managed Services"),
        ("/?go=v2-sol", "", "sol", "Solutions"),
        ("/?go=v2-ac", "", "ac", "Academy"),
        ("/?go=pricing", ' class="buy"', "pr", "Pricing"),
    ])
    + '</nav>'
)


def footer(year):
    return (
        '<footer class="ms-foot">\n'
        '  <div class="ms-wrap ms-links"><a href="/case-studies/">Case Studies</a><a href="/blog/">Insights</a><a href="/news/">Technology news</a>'
        '<a href="/newswire/">Tech Newswire</a><a href="https://www.facebook.com/mosesagentic" target="_blank" rel="noopener">Facebook</a>'
        '<a href="/?go=about">About</a><a href="/?go=disclosures">Disclosures</a></div>\n'
        '  <div class="ms-wrap ms-base">\n'
        '    <div class="ms-name">Moses Agentic</div>\n'
        '    <p class="ms-locs">' + PIN + '<b>Based in New York</b> <span>Servicing enterprises worldwide</span> '
        '<span>· <a href="mailto:welcome@mosesagentic.com">welcome@mosesagentic.com</a></span></p>\n'
        '    <small>AI services, agents and education for real businesses. <a href="https://chochamai.com/#en">chochamai.com</a> © %d</small>\n'
        '  </div>\n'
        '</footer>' % year
    )


def values(year):
    """The shell pieces as template values: {{shell_head}}, {{shell_top}}, {{shell_fx}}, {{shell_dock}}, {{shell_footer}}."""
    return {"shell_head": HEAD, "shell_top": TOP, "shell_fx": FX, "shell_dock": DOCK, "shell_footer": footer(year)}
