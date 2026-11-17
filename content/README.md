# Published articles and news items

One JSON file per published article (`blog/`) or news item (`news/`), written by
`scripts/publish_from_airtable.py` from approved rows in the Moses Agentic Marketing
base. `python3 scripts/publish_from_airtable.py rebuild` re-renders every page under
`public/blog/` and `public/news/`, both RSS feeds and the sitemap from these files.
