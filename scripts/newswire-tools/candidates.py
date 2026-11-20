"""Builds the candidate source list for the newswire: a hand-picked core list plus public curated lists.

Run with -I. The downloaded lists are read as data only: feed URLs and titles are taken from them, nothing else.
Usage: python3 -I candidates.py <dir with the downloaded lists> <out json>
"""
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

LISTS = Path(sys.argv[1])
OUT = Path(sys.argv[2])

# name | feed | category
CORE = """
OpenAI|https://openai.com/news/rss.xml|labs
Google DeepMind|https://deepmind.google/blog/rss.xml|labs
Google: AI|https://blog.google/technology/ai/rss/|labs
Google Research|https://research.google/blog/rss/|research
Meta AI|https://ai.meta.com/blog/rss/|labs
Microsoft AI|https://blogs.microsoft.com/ai/feed/|labs
Microsoft Research|https://www.microsoft.com/en-us/research/feed/|research
Hugging Face|https://huggingface.co/blog/feed.xml|labs
Apple Machine Learning Research|https://machinelearning.apple.com/rss.xml|research
Amazon Science|https://www.amazon.science/index.rss|research
AWS Machine Learning Blog|https://aws.amazon.com/blogs/machine-learning/feed/|labs
Berkeley AI Research|https://bair.berkeley.edu/blog/feed.xml|research
MIT News: Artificial intelligence|https://news.mit.edu/rss/topic/artificial-intelligence2|research
MIT News: Machine learning|https://news.mit.edu/rss/topic/machine-learning|research
Stanford HAI|https://hai.stanford.edu/news/rss.xml|research
Carnegie Mellon ML Blog|https://blog.ml.cmu.edu/feed/|research
The Gradient|https://thegradient.pub/rss/|ainews
Distill|https://distill.pub/rss.xml|research
arXiv: Artificial Intelligence|https://export.arxiv.org/rss/cs.AI|research
arXiv: Machine Learning|https://export.arxiv.org/rss/cs.LG|research
arXiv: Computation and Language|https://export.arxiv.org/rss/cs.CL|research
arXiv: Computer Vision|https://export.arxiv.org/rss/cs.CV|research
arXiv: Robotics|https://export.arxiv.org/rss/cs.RO|research
arXiv: Statistics ML|https://export.arxiv.org/rss/stat.ML|research
Nature Machine Intelligence|https://www.nature.com/natmachintell.rss|research
Databricks|https://www.databricks.com/feed|labs
LangChain|https://blog.langchain.dev/rss/|labs
Replicate|https://replicate.com/blog/rss|labs
Cohere|https://cohere.com/blog/rss.xml|labs
Salesforce AI Research|https://blog.salesforceairesearch.com/rss/|research
IBM Research|https://research.ibm.com/rss|research
NVIDIA Blog|https://blogs.nvidia.com/feed/|chips
NVIDIA Developer|https://developer.nvidia.com/blog/feed/|chips
PyTorch|https://pytorch.org/feed.xml|labs
TensorFlow|https://blog.tensorflow.org/feeds/posts/default|labs
Roboflow|https://blog.roboflow.com/rss/|labs
AssemblyAI|https://www.assemblyai.com/blog/rss/|labs
Weaviate|https://weaviate.io/blog/rss.xml|labs
Together AI|https://www.together.ai/blog/rss.xml|labs
Mistral AI|https://mistral.ai/rss.xml|labs
Stability AI|https://stability.ai/news?format=rss|labs
Google Cloud: AI and machine learning|https://cloudblog.withgoogle.com/products/ai-machine-learning/rss/|labs
MIT Technology Review|https://www.technologyreview.com/feed/|ainews
MIT Technology Review: AI|https://www.technologyreview.com/topic/artificial-intelligence/feed|ainews
VentureBeat: AI|https://venturebeat.com/category/ai/feed/|ainews
VentureBeat|https://venturebeat.com/feed/|tech
TechCrunch: AI|https://techcrunch.com/category/artificial-intelligence/feed/|ainews
TechCrunch|https://techcrunch.com/feed/|tech
The Verge: AI|https://www.theverge.com/rss/ai-artificial-intelligence/index.xml|ainews
The Verge|https://www.theverge.com/rss/index.xml|tech
Ars Technica|https://feeds.arstechnica.com/arstechnica/index|tech
Ars Technica: AI|https://arstechnica.com/ai/feed/|ainews
Wired|https://www.wired.com/feed/rss|tech
Wired: AI|https://www.wired.com/feed/tag/ai/latest/rss|ainews
The Decoder|https://the-decoder.com/feed/|ainews
AI News|https://www.artificialintelligence-news.com/feed/|ainews
MarkTechPost|https://www.marktechpost.com/feed/|ainews
Unite.AI|https://www.unite.ai/feed/|ainews
Analytics Vidhya|https://www.analyticsvidhya.com/feed/|ainews
KDnuggets|https://www.kdnuggets.com/feed|ainews
Towards Data Science|https://towardsdatascience.com/feed|ainews
Machine Learning Mastery|https://machinelearningmastery.com/feed/|ainews
Synced|https://syncedreview.com/feed/|ainews
AI Business|https://aibusiness.com/rss.xml|ainews
Analytics India Magazine|https://analyticsindiamag.com/feed/|ainews
InfoQ: AI, ML and data engineering|https://feed.infoq.com/ai-ml-data-eng/|ainews
IEEE Spectrum: Artificial intelligence|https://spectrum.ieee.org/feeds/topic/artificial-intelligence.rss|ainews
IEEE Spectrum|https://spectrum.ieee.org/feeds/feed.rss|tech
ScienceDaily: Artificial intelligence|https://www.sciencedaily.com/rss/computers_math/artificial_intelligence.xml|research
The Guardian: Artificial intelligence|https://www.theguardian.com/technology/artificialintelligenceai/rss|ainews
The Guardian: Technology|https://www.theguardian.com/uk/technology/rss|tech
The New York Times: Technology|https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml|tech
BBC News: Technology|https://feeds.bbci.co.uk/news/technology/rss.xml|tech
CNBC: Technology|https://www.cnbc.com/id/19854910/device/rss/rss.html|tech
ZDNET|https://www.zdnet.com/news/rss.xml|tech
ZDNET: Artificial intelligence|https://www.zdnet.com/topic/artificial-intelligence/rss.xml|ainews
Engadget|https://www.engadget.com/rss.xml|tech
Gizmodo|https://gizmodo.com/feed|tech
TechRadar|https://www.techradar.com/rss|tech
The Register|https://www.theregister.com/headlines.atom|tech
The Register: AI and ML|https://www.theregister.com/software/ai_ml/headlines.atom|ainews
CNET|https://www.cnet.com/rss/news/|tech
Mashable: Tech|https://mashable.com/feeds/rss/tech|tech
Fast Company: Technology|https://www.fastcompany.com/technology/rss|tech
Bloomberg: Technology|https://feeds.bloomberg.com/technology/news.rss|biz
Financial Times: Technology|https://www.ft.com/technology?format=rss|biz
The Wall Street Journal: Technology|https://feeds.a.dj.com/rss/RSSWSJD.xml|biz
The Washington Post: Technology|https://feeds.washingtonpost.com/rss/business/technology|tech
Rest of World|https://restofworld.org/feed/latest/|tech
404 Media|https://www.404media.co/rss/|tech
Platformer|https://www.platformer.news/rss/|tech
Stratechery|https://stratechery.com/feed/|biz
Benedict Evans|https://www.ben-evans.com/benedictevans?format=rss|biz
Import AI|https://importai.substack.com/feed|ainews
The Batch|https://www.deeplearning.ai/the-batch/feed/|ainews
Last Week in AI|https://lastweekin.ai/feed|ainews
Ben's Bites|https://www.bensbites.com/feed|ainews
The Algorithmic Bridge|https://www.thealgorithmicbridge.com/feed|ainews
One Useful Thing|https://www.oneusefulthing.org/feed|ainews
Simon Willison|https://simonwillison.net/atom/everything/|ainews
Interconnects|https://www.interconnects.ai/feed|ainews
Ahead of AI|https://magazine.sebastianraschka.com/feed|ainews
Latent Space|https://www.latent.space/feed|ainews
AI Snake Oil|https://www.aisnakeoil.com/feed|ainews
Marcus on AI|https://garymarcus.substack.com/feed|ainews
Don't Worry About the Vase|https://thezvi.substack.com/feed|safety
Astral Codex Ten|https://www.astralcodexten.com/feed|policy
Understanding AI|https://www.understandingai.org/feed|ainews
Exponential View|https://www.exponentialview.co/feed|ainews
ChinaTalk|https://www.chinatalk.media/feed|policy
SemiAnalysis|https://www.semianalysis.com/feed|chips
The Pragmatic Engineer|https://newsletter.pragmaticengineer.com/feed|dev
AI Supremacy|https://www.ai-supremacy.com/feed|ainews
Dwarkesh Podcast|https://www.dwarkesh.com/feed|ainews
Hacker News: Front page|https://hnrss.org/frontpage|community
Hacker News: Best|https://hnrss.org/best|community
Lobsters|https://lobste.rs/rss|community
Techmeme|https://www.techmeme.com/feed.xml|tech
Slashdot|https://rss.slashdot.org/Slashdot/slashdotMain|tech
Product Hunt|https://www.producthunt.com/feed|biz
AI Alignment Forum|https://www.alignmentforum.org/feed.xml|safety
LessWrong: Curated|https://www.lesswrong.com/feed.xml?view=curated-rss|safety
Machine Intelligence Research Institute|https://intelligence.org/feed/|safety
Future of Life Institute|https://futureoflife.org/feed/|safety
Center for AI Safety: AI Safety Newsletter|https://newsletter.safe.ai/feed|safety
Center for Security and Emerging Technology|https://cset.georgetown.edu/feed/|safety
80,000 Hours|https://80000hours.org/feed/|policy
AI Impacts|https://aiimpacts.org/feed/|safety
Redwood Research|https://redwoodresearch.substack.com/feed|safety
AI Now Institute|https://ainowinstitute.org/feed|safety
Ada Lovelace Institute|https://www.adalovelaceinstitute.org/feed/|safety
Electronic Frontier Foundation|https://www.eff.org/rss/updates.xml|policy
Transformer|https://www.transformernews.ai/feed|safety
Hyperdimensional|https://www.hyperdimensional.co/feed|safety
Rising Tide|https://helentoner.substack.com/feed|safety
Epoch AI|https://epoch.ai/blog/rss.xml|safety
METR|https://metr.org/feed.xml|safety
Brookings: Artificial intelligence|https://www.brookings.edu/topic/artificial-intelligence/feed/|safety
Lawfare|https://www.lawfaremedia.org/feeds/articles|policy
Tech Policy Press|https://www.techpolicy.press/rss/feed.xml|policy
Tom's Hardware|https://www.tomshardware.com/feeds/all|chips
The Robot Report|https://www.therobotreport.com/feed/|chips
IEEE Spectrum: Robotics|https://spectrum.ieee.org/feeds/topic/robotics.rss|chips
Semiconductor Engineering|https://semiengineering.com/feed/|chips
EE Times|https://www.eetimes.com/feed/|chips
HPCwire|https://www.hpcwire.com/feed/|chips
Data Center Dynamics|https://www.datacenterdynamics.com/en/rss/|chips
Robohub|https://robohub.org/feed/|chips
ServeTheHome|https://www.servethehome.com/feed/|chips
The Next Platform|https://www.nextplatform.com/feed/|chips
Phoronix|https://www.phoronix.com/rss.php|chips
Electrek|https://electrek.co/feed/|chips
Crunchbase News|https://news.crunchbase.com/feed/|biz
SiliconANGLE|https://siliconangle.com/feed/|biz
GeekWire|https://www.geekwire.com/feed/|biz
Sifted|https://sifted.eu/feed|biz
Tech.eu|https://tech.eu/feed/|biz
EU-Startups|https://www.eu-startups.com/feed/|biz
Andreessen Horowitz|https://a16z.com/feed/|biz
Not Boring|https://www.notboring.co/feed|biz
PYMNTS: Artificial intelligence|https://www.pymnts.com/category/artificial-intelligence-2/feed/|biz
Fortune: Tech|https://fortune.com/section/tech/feed/|biz
InfoWorld|https://www.infoworld.com/feed/|dev
Computerworld|https://www.computerworld.com/feed/|tech
CIO|https://www.cio.com/feed/|biz
Network World|https://www.networkworld.com/feed/|dev
The New Stack|https://thenewstack.io/feed/|dev
InfoQ|https://feed.infoq.com/|dev
SD Times|https://sdtimes.com/feed/|dev
TechRepublic|https://www.techrepublic.com/rssfeeds/articles/|tech
Tech Xplore|https://techxplore.com/rss-feed/|research
Tech Xplore: Machine learning and AI|https://techxplore.com/rss-feed/machine-learning-ai-news/|research
Phys.org: Technology|https://phys.org/rss-feed/technology-news/|sci
New Scientist: Technology|https://www.newscientist.com/subject/technology/feed/|sci
Quanta Magazine|https://www.quantamagazine.org/feed/|sci
Singularity Hub|https://singularityhub.com/feed/|ainews
Futurism|https://futurism.com/feed|tech
The Conversation: Technology|https://theconversation.com/us/technology/articles.atom|tech
Vox: Technology|https://www.vox.com/rss/technology/index.xml|tech
Slate: Technology|https://slate.com/feeds/technology.rss|tech
The Atlantic: Technology|https://www.theatlantic.com/feed/channel/technology/|tech
NPR: Technology|https://feeds.npr.org/1019/rss.xml|tech
South China Morning Post: Tech|https://www.scmp.com/rss/36/feed|tech
TechNode|https://technode.com/feed/|tech
Tech in Asia|https://www.techinasia.com/feed|biz
KrASIA|https://kr-asia.com/feed|biz
The Next Web|https://thenextweb.com/feed|tech
Digital Trends|https://www.digitaltrends.com/feed/|tech
PCMag|https://www.pcmag.com/feeds/rss/latest|tech
PCWorld|https://www.pcworld.com/feed|tech
How-To Geek|https://www.howtogeek.com/feed/|tech
TechSpot|https://www.techspot.com/backend.xml|tech
ExtremeTech|https://www.extremetech.com/feed|tech
Android Authority|https://www.androidauthority.com/feed/|tech
9to5Mac|https://9to5mac.com/feed/|tech
9to5Google|https://9to5google.com/feed/|tech
MacRumors|https://feeds.macrumors.com/MacRumors-All|tech
Windows Central|https://www.windowscentral.com/rss|tech
Android Police|https://www.androidpolice.com/feed/|tech
XDA|https://www.xda-developers.com/feed/|tech
Krebs on Security|https://krebsonsecurity.com/feed/|sec
The Hacker News|https://feeds.feedburner.com/TheHackersNews|sec
BleepingComputer|https://www.bleepingcomputer.com/feed/|sec
Dark Reading|https://www.darkreading.com/rss.xml|sec
SecurityWeek|https://www.securityweek.com/feed/|sec
Schneier on Security|https://www.schneier.com/feed/atom/|sec
The Record|https://therecord.media/feed|sec
CyberScoop|https://cyberscoop.com/feed/|sec
Help Net Security|https://www.helpnetsecurity.com/feed/|sec
Troy Hunt|https://www.troyhunt.com/rss/|sec
Google Security Blog|https://security.googleblog.com/feeds/posts/default|sec
Microsoft Security Blog|https://www.microsoft.com/en-us/security/blog/feed/|sec
Google Cloud Blog|https://cloudblog.withgoogle.com/rss/|dev
Google Developers Blog|https://developers.googleblog.com/feeds/posts/default|dev
Android Developers Blog|https://android-developers.googleblog.com/feeds/posts/default|dev
The Keyword (Google)|https://blog.google/rss/|bigtech
Microsoft Azure Blog|https://azure.microsoft.com/en-us/blog/feed/|dev
The Official Microsoft Blog|https://blogs.microsoft.com/feed/|bigtech
Microsoft 365 Blog|https://www.microsoft.com/en-us/microsoft-365/blog/feed/|bigtech
Windows Blog|https://blogs.windows.com/feed/|bigtech
Apple Newsroom|https://www.apple.com/newsroom/rss-feed.rss|bigtech
Meta Newsroom|https://about.fb.com/news/feed/|bigtech
Engineering at Meta|https://engineering.fb.com/feed/|dev
AWS News Blog|https://aws.amazon.com/blogs/aws/feed/|dev
Salesforce News|https://www.salesforce.com/news/feed/|bigtech
Netflix TechBlog|https://netflixtechblog.com/feed|dev
Uber Engineering|https://www.uber.com/blog/engineering/rss/|dev
Spotify Engineering|https://engineering.atspotify.com/feed/|dev
Dropbox Tech|https://dropbox.tech/feed|dev
Stripe|https://stripe.com/blog/feed.rss|dev
Shopify Engineering|https://shopify.engineering/blog.atom|dev
Slack Engineering|https://slack.engineering/feed/|dev
Cloudflare|https://blog.cloudflare.com/rss/|dev
GitHub|https://github.blog/feed/|dev
GitHub: AI and ML|https://github.blog/ai-and-ml/feed/|labs
Stack Overflow Blog|https://stackoverflow.blog/feed/|dev
Zapier|https://zapier.com/blog/feeds/latest/|dev
Docker|https://www.docker.com/blog/feed/|dev
Kubernetes|https://kubernetes.io/feed.xml|dev
HashiCorp|https://www.hashicorp.com/blog/feed.xml|dev
Mozilla|https://blog.mozilla.org/feed/|bigtech
Mozilla Hacks|https://hacks.mozilla.org/feed/|dev
Chromium Blog|https://blog.chromium.org/feeds/posts/default|dev
WebKit|https://webkit.org/feed/|dev
Rust|https://blog.rust-lang.org/feed.xml|dev
Go|https://go.dev/blog/feed.atom|dev
JetBrains|https://blog.jetbrains.com/feed/|dev
Visual Studio Code|https://code.visualstudio.com/feed.xml|dev
DEV Community|https://dev.to/feed|dev
freeCodeCamp|https://www.freecodecamp.org/news/rss/|dev
LWN|https://lwn.net/headline/rss|dev
Red Hat|https://www.redhat.com/en/rss/blog|dev
Ubuntu|https://ubuntu.com/blog/feed|dev
Snowflake|https://www.snowflake.com/feed/|dev
MongoDB|https://www.mongodb.com/blog/rss|dev
Elastic|https://www.elastic.co/blog/feed|dev
NASA|https://www.nasa.gov/news-release/feed/|sci
Space.com|https://www.space.com/feeds/all|sci
SpaceNews|https://spacenews.com/feed/|sci
Nature|https://www.nature.com/nature.rss|sci
Science: News|https://www.science.org/rss/news_current.xml|sci
Live Science|https://www.livescience.com/feeds/all|sci
Popular Science|https://www.popsci.com/feed/|sci
Microsoft AI|https://news.microsoft.com/source/topics/ai/feed/|labs
PyTorch|https://pytorch.org/blog/feed/|labs
PyTorch|https://pytorch.org/blog/feed.xml|labs
Epoch AI|https://epochai.substack.com/feed|safety
Epoch AI|https://epoch.ai/atom.xml|safety
Andreessen Horowitz|https://www.a16z.news/feed|biz
Fortune|https://fortune.com/feed/|biz
LWN|https://lwn.net/headlines/rss|dev
AssemblyAI|https://www.assemblyai.com/blog/rss.xml|labs
Salesforce: AI research|https://www.salesforce.com/blog/category/ai-research/feed/|research
CNBC: Technology|https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=19854910|tech
The Wall Street Journal: Technology|https://feeds.content.dowjones.io/public/rss/RSSWSJD|biz
SemiAnalysis|https://newsletter.semianalysis.com/feed|chips
Anthropic: News|https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_news.xml|labs
Anthropic: Engineering|https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_engineering.xml|labs
Anthropic: Research|https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_research.xml|research
xAI: News|https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_xainews.xml|labs
Ollama|https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_ollama.xml|labs
LessWrong: Front page|https://www.lesswrong.com/feed.xml?view=frontpage-rss&karmaThreshold=75|policy
Allen Institute for AI|https://blog.allenai.org/feed|research
Sebastian Ruder|https://www.ruder.io/rss/|research
Lil'Log|https://lilianweng.github.io/index.xml|research
Chip Huyen|https://huyenchip.com/feed.xml|ainews
Eugene Yan|https://eugeneyan.com/rss/|ainews
Hacker News: AI|https://hnrss.org/newest?q=AI&points=100|community
The Information|https://www.theinformation.com/feed|biz
Axios|https://api.axios.com/feed/|tech
Semafor|https://www.semafor.com/rss.xml|tech
Politico: Technology|https://rss.politico.com/technology.xml|policy
The Hill: Technology|https://thehill.com/policy/technology/feed/|policy
Nature: Machine learning|https://www.nature.com/subjects/machine-learning.rss|research
Journal of Machine Learning Research|https://jmlr.org/jmlr.xml|research
arXiv: Neural and Evolutionary Computing|https://export.arxiv.org/rss/cs.NE|research
arXiv: Multiagent Systems|https://export.arxiv.org/rss/cs.MA|research
arXiv: Computers and Society|https://export.arxiv.org/rss/cs.CY|research
arXiv: Information Retrieval|https://export.arxiv.org/rss/cs.IR|research
OpenAI: Developers|https://developers.openai.com/blog/rss.xml|labs
Microsoft Azure: AI and machine learning|https://azure.microsoft.com/en-us/blog/category/ai-machine-learning/feed/|labs
Scale AI|https://scale.com/blog/rss.xml|labs
Weights and Biases|https://wandb.ai/fully-connected/rss.xml|labs
Pinecone|https://www.pinecone.io/rss.xml|labs
Anyscale|https://www.anyscale.com/rss.xml|labs
Modal|https://modal.com/blog/feed.rss|labs
Ollama|https://ollama.com/blog/rss.xml|labs
LlamaIndex|https://www.llamaindex.ai/blog/feed|labs
Vercel|https://vercel.com/atom|dev
ElevenLabs|https://elevenlabs.io/blog/rss.xml|labs
Groq|https://groq.com/feed/|chips
Cerebras|https://www.cerebras.ai/blog/rss.xml|chips
Lightning AI|https://lightning.ai/pages/feed/|labs
fast.ai|https://www.fast.ai/index.xml|research
Answer.AI|https://www.answer.ai/index.xml|research
TheSequence|https://thesequence.substack.com/feed|ainews
TLDR AI|https://tldr.tech/api/rss/ai|ainews
TLDR Tech|https://tldr.tech/api/rss/tech|tech
The Rundown AI|https://rss.beehiiv.com/feeds/2R3C6Bt5wj.xml|ainews
State of AI|https://nathanbenaich.substack.com/feed|ainews
Air Street Press|https://press.airstreet.com/feed|ainews
AI Policy Perspectives|https://www.aipolicyperspectives.com/feed|safety
Threading the Needle|https://writing.antonleicht.me/feed|safety
The Power Law|https://peterwildeford.substack.com/feed|safety
Miles Brundage|https://milesbrundage.substack.com/feed|safety
AI as Normal Technology|https://www.normaltech.ai/feed|ainews
Second Thoughts|https://secondthoughts.ai/feed|safety
AI Futures Project|https://blog.ai-futures.org/feed|safety
Forethought|https://www.forethought.org/feed.xml|safety
Apollo Research|https://www.apolloresearch.ai/blog?format=rss|safety
Anthropic: Alignment Science|https://alignment.anthropic.com/feed.xml|safety
OpenAI: Alignment|https://alignment.openai.com/rss.xml|safety
DeepMind Safety Research|https://deepmindsafetyresearch.medium.com/feed|safety
AI Security Institute|https://www.aisi.gov.uk/rss.xml|safety
Centre for the Governance of AI|https://www.governance.ai/rss.xml|safety
AI Frontiers|https://ai-frontiers.org/feed|safety
AI Frontiers|https://www.ai-frontiers.org/rss.xml|safety
Vox: Future Perfect|https://www.vox.com/rss/future-perfect/index.xml|policy
TIME: Tech|https://time.com/tech/feed/|tech
TIME|https://time.com/feed/|policy
The Economist: Science and technology|https://www.economist.com/science-and-technology/rss.xml|sci
Scientific American|https://www.scientificamerican.com/platform/syndication/rss/|sci
Noema|https://www.noemamag.com/feed/|policy
Asterisk|https://asteriskmag.com/feed|policy
Planned Obsolescence|https://www.planned-obsolescence.org/rss/|safety
Marginal Revolution|https://marginalrevolution.com/feed|policy
Noahpinion|https://www.noahpinion.blog/feed|policy
Sam Altman|https://blog.samaltman.com/posts.atom|ainews
Andrej Karpathy|https://karpathy.bearblog.dev/feed/|ainews
Gwern|https://gwern.substack.com/feed|policy
Shtetl-Optimized|https://scottaaronson.blog/?feed=rss2|policy
Yoshua Bengio|https://yoshuabengio.org/feed/|safety
Francois Chollet|https://fchollet.substack.com/feed|ainews
Hamel Husain|https://hamel.dev/index.xml|ainews
Jason Liu|https://jxnl.co/feed_rss_created.xml|ainews
Neel Nanda|https://www.neelnanda.io/blog?format=rss|safety
ML Safety Newsletter|https://newsletter.mlsafety.org/feed|safety
BlueDot Impact|https://blog.bluedot.org/feed|safety
FAR.AI|https://far.ai/feed.xml|safety
FAR.AI|https://www.far.ai/rss.xml|safety
ControlAI|https://controlai.news/feed|safety
AI Safety Takes|https://newsletter.danielpaleka.com/feed|safety
Obsolete|https://www.obsolete.pub/feed|safety
The Cognitive Revolution|https://www.cognitiverevolution.ai/feed|ainews
Lex Fridman Podcast|https://lexfridman.com/feed/podcast/|policy
TWIML|https://twimlai.com/feed/|ainews
Practical AI|https://changelog.com/practicalai/feed|ainews
Tech Monitor|https://www.techmonitor.ai/feed|tech
AI Magazine|https://aimagazine.com/feed|ainews
Emerj|https://emerj.com/feed/|ainews
BigDATAwire|https://www.bigdatawire.com/feed/|ainews
AIwire|https://www.aiwire.net/feed/|ainews
insideAI News|https://insideainews.com/feed/|ainews
DailyAI|https://dailyai.com/feed/|ainews
TrendForce|https://www.trendforce.com/news/feed/|chips
Maginative|https://www.maginative.com/rss/|ainews
Implicator.ai|https://www.implicator.ai/rss/|ainews
TestingCatalog|https://www.testingcatalog.com/rss/|ainews
Business Insider|https://feeds.businessinsider.com/custom/all|biz
Forbes: AI|https://www.forbes.com/ai/feed/|ainews
Forbes: Innovation|https://www.forbes.com/innovation/feed2|biz
Quartz|https://qz.com/rss|biz
The Markup|https://themarkup.org/feeds/rss.xml|policy
Nikkei Asia|https://asia.nikkei.com/rss/feed/nar|biz
VideoCardz|https://videocardz.com/rss-feed|chips
Wccftech|https://wccftech.com/feed/|chips
Data Center Knowledge|https://www.datacenterknowledge.com/rss.xml|chips
Data Center Frontier|https://www.datacenterfrontier.com/rss|chips
IEEE Spectrum: Semiconductors|https://spectrum.ieee.org/feeds/topic/semiconductors.rss|chips
IEEE Spectrum: Computing|https://spectrum.ieee.org/feeds/topic/computing.rss|tech
Communications of the ACM|https://cacm.acm.org/feed/|research
MIT CSAIL|https://www.csail.mit.edu/rss.xml|research
Princeton CITP|https://blog.citp.princeton.edu/feed/|policy
Robotics and Automation News|https://roboticsandautomationnews.com/feed/|chips
DroneDJ|https://dronedj.com/feed/|chips
The Neuron|https://www.theneurondaily.com/feed|ainews
Turing Post|https://www.turingpost.com/feed|ainews
Artificial Ignorance|https://www.ignorance.ai/feed|ainews
The AI Daily Brief|https://feeds.megaphone.fm/nlw|ainews
Big Technology|https://www.bigtechnology.com/feed|tech
Newcomer|https://www.newcomer.co/feed|biz
The Generalist|https://www.generalist.com/feed|biz
Where's Your Ed At|https://www.wheresyoured.at/rss/|policy
Pluralistic|https://pluralistic.net/feed/|policy
Daring Fireball|https://daringfireball.net/feeds/main|tech
Six Colors|https://sixcolors.com/feed/|tech
Garbage Day|https://www.garbageday.email/feed|tech
Jack Clark: Import AI|https://jack-clark.net/feed/|ainews
Anthropic: Red team|https://red.anthropic.com/feed.xml|safety
Google: Safety and security|https://blog.google/technology/safety-security/rss/|sec
Google: Developers|https://blog.google/technology/developers/rss/|dev
Google DeepMind (blog.google)|https://blog.google/technology/google-deepmind/rss/|labs
OpenAI (community feed)|https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_openai_research.xml|research
The Verge: Tech|https://www.theverge.com/rss/tech/index.xml|tech
The Verge: Science|https://www.theverge.com/rss/science/index.xml|sci
TechCrunch: Startups|https://techcrunch.com/category/startups/feed/|biz
TechCrunch: Venture|https://techcrunch.com/category/venture/feed/|biz
TechCrunch: Security|https://techcrunch.com/category/security/feed/|sec
Ars Technica: Science|https://arstechnica.com/science/feed/|sci
Ars Technica: Tech policy|https://arstechnica.com/tech-policy/feed/|policy
Ars Technica: Security|https://arstechnica.com/security/feed/|sec
Wired: Business|https://www.wired.com/feed/category/business/latest/rss|biz
Wired: Science|https://www.wired.com/feed/category/science/latest/rss|sci
Wired: Security|https://www.wired.com/feed/category/security/latest/rss|sec
The Guardian: Science|https://www.theguardian.com/science/rss|sci
The New York Times: Science|https://rss.nytimes.com/services/xml/rss/nyt/Science.xml|sci
The New York Times: Business|https://rss.nytimes.com/services/xml/rss/nyt/Business.xml|biz
BBC News: Science|https://feeds.bbci.co.uk/news/science_and_environment/rss.xml|sci
BBC News: Business|https://feeds.bbci.co.uk/news/business/rss.xml|biz
MIT News: Robotics|https://news.mit.edu/rss/topic/robotics|research
MIT News: Computer science|https://news.mit.edu/rss/topic/computers|research
ScienceDaily: Robotics|https://www.sciencedaily.com/rss/computers_math/robotics.xml|research
ScienceDaily: Computer science|https://www.sciencedaily.com/rss/computers_math/computer_science.xml|research
Phys.org: Computer sciences|https://phys.org/rss-feed/technology-news/computer-sciences/|research
Tech Xplore: Robotics|https://techxplore.com/rss-feed/robotics-news/|chips
Tech Xplore: Hardware|https://techxplore.com/rss-feed/hardware-news/|chips
"""

# which downloaded lists to take, and the category their feeds get
IMPORTS = [
    ("aifeeds.opml", "ainews"), ("techrss.opml", "dev"),
    ("plenary-Tech.opml", "tech"), ("plenary-Programming.opml", "dev"), ("plenary-Science.opml", "sci"), ("plenary-Startups.opml", "biz"),
    ("plenary-Apple.opml", "tech"), ("plenary-Android.opml", "tech"),
    ("plenary-Android_Development.opml", "dev"), ("plenary-iOS_Development.opml", "dev"), ("plenary-Web_Development.opml", "dev"), ("plenary-Space.opml", "sci"),
    ("engblogs.opml", "dev"),
]
MD_IMPORTS = [("ml-ai-readme.md", "ainews"), ("aifeeds-readme.md", "ainews"), ("techrss.md", "dev")]

URL_OK = re.compile(r"^https?://[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]{6,300}$")


def clean_name(s):
    s = re.sub(r"\s+", " ", str(s or "")).strip()
    if re.fullmatch(r"\(?\s*(rss|feed|atom|xml|link|subscribe|rss feed)\s*\)?", s, re.I):
        return ""  # link text that is not a name: the feed's own title is used
    s = re.sub(r"[<>\"]", "", s)
    return s[:70]


def key(url):
    u = url.strip().lower()
    u = re.sub(r"^https?://(www\.)?", "", u)
    return u.rstrip("/")


# well-known sources that refuse this container's address (403, 429, 5xx) but are public feeds
KEEP = {
    "https://venturebeat.com/category/ai/feed/", "https://venturebeat.com/feed/", "https://www.artificialintelligence-news.com/feed/",
    "https://www.unite.ai/feed/", "https://www.cnbc.com/id/19854910/device/rss/rss.html", "https://cacm.acm.org/feed/",
    "https://www.eu-startups.com/feed/", "https://dev.to/feed", "https://www.turingpost.com/feed", "https://insideainews.com/feed/",
}
out, seen = [], set()


def add(name, feed, cat, origin):
    feed = feed.strip()
    if not URL_OK.match(feed):
        return
    k = key(feed)
    if k in seen:
        return
    seen.add(k)
    row = {"name": clean_name(name), "feed": feed, "cat": cat, "from": origin}
    if feed in KEEP:
        row["keep"] = True
    out.append(row)


for line in CORE.strip().splitlines():
    name, feed, cat = [x.strip() for x in line.split("|")]
    add(name, feed, cat, "core")

for fname, cat in IMPORTS:
    p = LISTS / fname
    if not p.exists():
        continue
    try:
        text = re.sub(r"<!DOCTYPE[^>]*>", "", p.read_text(encoding="utf-8", errors="replace"))
        root = ET.fromstring(text)
    except Exception as e:  # a list that does not parse is skipped
        print("skip", fname, str(e)[:80])
        continue
    for o in root.iter("outline"):
        feed = o.attrib.get("xmlUrl") or o.attrib.get("xmlurl") or ""
        if feed:
            add(o.attrib.get("title") or o.attrib.get("text") or "", feed, cat, fname)

for fname, cat in MD_IMPORTS:
    p = LISTS / fname
    if not p.exists():
        continue
    for m in re.finditer(r"\[([^\]]{2,80})\]\((https?://[^)\s]+)\)", p.read_text(encoding="utf-8", errors="replace")):
        name, url = m.group(1), m.group(2)
        if re.search(r"(rss|feed|atom|\.xml)", url, re.I) and "github.com" not in url:
            add(name, url, cat, fname)
    for m in re.finditer(r"(?<![\(\[])(https?://[^\s)|<>\"]+)", p.read_text(encoding="utf-8", errors="replace")):
        url = m.group(1).rstrip(".,")
        if re.search(r"(rss|feed|atom|\.xml)", url, re.I) and "github.com" not in url and "shields.io" not in url:
            add("", url, cat, fname)

OUT.write_text(json.dumps(out, indent=1), encoding="utf-8")
from collections import Counter
print(len(out), "candidates;", dict(Counter(x["from"] for x in out)))
