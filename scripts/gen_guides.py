"""Generate iqprep.app/guides/ from the app's own per-game guidance (dumped to .tmp/guides.json)."""
import json, html, os, re  # run: python -I scripts/gen_guides.py (after dumping .tmp/guides.json; see README)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
d = json.load(open(ROOT + "/.tmp/guides.json", encoding="utf-8"))
G = d["subtests"]
def e(s):
    s = s.replace(" — ", ", ").replace("—", ", ").replace(" – ", ", ")
    s = re.sub(r"(\d)–(\d)", lambda m: m.group(1) + " to " + m.group(2), s).replace("–", "-")
    return html.escape(s, quote=True)

priv = open(ROOT + "/site/privacy/index.html", encoding="utf-8").read()
HEAD = priv[: priv.index("  <main id=\"main\"")]
FOOT = priv[priv.index("  <footer"):]


def page(path, title, desc, body, depth):
    h = HEAD.replace("<title>Privacy: IQ Prep</title>", f"<title>{e(title)}</title>")
    h = re.sub(r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{e(desc)}">', h)
    h = h.replace('<link rel="canonical" href="https://iqprep.app/privacy/">', f'<link rel="canonical" href="https://iqprep.app/{path}">')
    h = h.replace('href="../site.css"', f'href="{"../" * depth}site.css"')
    h = h.replace('<a class="nav__link" href="/#styles">Question styles</a>', '<a class="nav__link" href="/guides/">Guides</a>')
    out = ROOT + "/site/" + path
    os.makedirs(out, exist_ok=True)
    open(out + "index.html", "w", encoding="utf-8").write(h + body + FOOT)


AREAS = [
    ("words-and-ideas", "VCI", "Words and ideas",
     "Questions that ask a child to explain: how two things are alike, what a word means, what they know about the world, and what to do in everyday situations.",
     "Most of these are answered out loud, so they test two things at once: knowing something, and putting it into words. In IQ Prep you can score them yourself as your child answers aloud (Grown-ups, then Settings), which is the closest match to how they are usually given."),
    ("shapes-and-space", "VSI", "Shapes and space",
     "Questions about seeing how shapes fit: copying a design with blocks, and choosing the pieces that make a shape without moving them.",
     "These are visual and mostly wordless. Speed matters a little, because the real versions are timed, but accuracy and a calm method matter more."),
    ("patterns-and-rules", "FRI", "Patterns and rules",
     "Questions about finding a rule from a few examples and using it: picture grids, balance scales, pictures that belong together, and math stories told out loud.",
     "This group is closest to what people usually picture as \u201creasoning\u201d. The skill that carries over is a habit: look at the examples, say the rule, then check every answer against it."),
    ("memory", "WMI", "Memory",
     "Questions about holding a few things in mind for a moment and working with them: numbers forwards and backwards, pictures in order, letters and numbers sorted.",
     "Short sequences are easy and long ones are hard for everyone, so every child reaches a point where they miss. Strategies like grouping and saying things quietly in your head make a real difference."),
    ("speed", "PSI", "Speed",
     "Simple tasks done quickly and accurately against a clock: copying symbols from a key, spotting a symbol in a row, finding animals on a busy page.",
     "Each item is easy; the challenge is a steady pace without careless slips. These are the questions where knowing the format in advance helps most, because the rules have to be understood before the clock starts."),
    ("naming-and-symbols", "EXTRA", "Naming and symbol learning",
     "Extra question types that are given less often: naming familiar things quickly, and learning a small picture language then reading it back.",
     "These relate to reading and math fluency. A psychologist adds them when there is a specific question to answer, so your child may never see them."),
]

PICS = {"MR": ("braincamp-patterns", 1800, 1438, "A Pattern Finder question in IQ Prep: a row of blue and red circles with the next one missing, and five shapes to choose from."),
        "BD": ("braincamp-blocks", 1800, 1736, "Block Builder in IQ Prep: a red-and-white design to copy, a palette of blocks and an empty grid to build on."),
        "FW": ("braincamp-scales", 1800, 2015, "Balance Scales in IQ Prep: a level scale as the clue, a second scale with a question mark, and five possible answers.")}


def pic(n, w, h, alt):
    srcs = "".join(f'<source type="image/{x}" srcset="/img/{n}.{x} {w}w" sizes="(min-width: 60rem) 40rem, 92vw">' for x in ("avif", "webp"))
    return f'<figure class="sheet guide__pic"><div class="sheet__paper"><picture>{srcs}<img src="/img/{n}.jpg" width="{w}" height="{h}" alt="{e(alt)}" loading="lazy" decoding="async"></picture></div></figure>'


def game_section(sid):
    s = G[sid]; g = s["guide"]
    parts = [f'    <section class="guide__game" id="{sid.lower()}" aria-labelledby="h-{sid.lower()}">',
             f'      <h2 id="h-{sid.lower()}">{e(s["kidName"])}</h2>',
             f'      <p class="guide__also">In WISC-V terms: {e(s["name"])}. It practises: {e(s["measures"][0].lower() + s["measures"][1:])}</p>']
    if sid in PICS:
        parts.append("      " + pic(*PICS[sid]))
    parts.append(f'      <p>{e(g["parentNotes"])}</p>')
    parts.append('      <h3>How it plays</h3>\n      <ol>' + "".join(f"<li>{e(x)}</li>" for x in g["howToPlay"]) + "</ol>")
    parts.append('      <h3>Strategies to show your child</h3>\n      <ul class="guide__tips">' +
                 "".join(f"<li><b>{e(t['title'])}.</b> {e(t['tip'])}</li>" for t in g["strategies"][:5]) + "</ul>")
    parts.append('      <h3>Common slips</h3>\n      <ul>' + "".join(f"<li>{e(x)}</li>" for x in g["commonMistakes"][:4]) + "</ul>")
    parts.append('      <h3>Try at home</h3>\n      <ul>' + "".join(f"<li>{e(x)}</li>" for x in g["everydayActivities"][:4]) + "</ul>")
    parts.append("    </section>")
    return "\n".join(parts)


NOTE = ('    <p class="guide__note">Every puzzle in IQ Prep is original and generated on the spot; none are real test questions, '
        'and practice results are estimates, not IQ scores. The aim is familiarity, so a test measures your child\u2019s thinking rather than their surprise. '
        'For questions about a particular assessment, ask the psychologist who gives it.</p>')

order = [a[0] for a in AREAS]
for i, (slug, zone, title, lede, more) in enumerate(AREAS):
    games = [k for k, s in G.items() if s["zone"] == zone]
    toc = "".join(f'<li><a href="#{k.lower()}">{e(G[k]["kidName"])}</a></li>' for k in games)
    nxt = AREAS[(i + 1) % len(AREAS)]
    body = f'''  <main id="main" class="container doc guide">
    <p class="meta"><a href="/guides/">Guides</a></p>
    <h1>{e(title)}</h1>
    <p class="lead">{e(lede)}</p>
    <p>{e(more)}</p>
    <nav class="guide__toc" aria-label="Games in this guide"><ul>{toc}</ul></nav>
{chr(10).join(game_section(k) for k in games)}
{NOTE}
    <p class="guide__next"><a class="btn btn--primary" href="/play/">Try these in IQ Prep</a> <a href="/guides/{nxt[0]}/">Next guide: {e(nxt[2].lower())}</a></p>
  </main>
'''
    page(f"guides/{slug}/", f"{title}: a parent’s guide to IQ-style questions | IQ Prep",
         f"{lede} Strategies, common slips and things to try at home, for parents.", body, 2)

# The before-a-test guide, written for this site.
before = '''  <main id="main" class="container doc guide">
    <p class="meta"><a href="/guides/">Guides</a></p>
    <h1>Using IQ Prep well before a test</h1>
    <p class="lead">The goal is a child who walks in knowing what the questions look like, not one who has been drilled.</p>

    <h2>Why familiarity matters</h2>
    <p>An ability test tries to measure how a child thinks. A question format they have never seen, a timer they did not expect, or a rule they misunderstood can cost points that have nothing to do with ability. Seeing each kind of question beforehand removes that noise, so the result says more about your child and less about surprise.</p>
    <p>That is also the limit of what practice should do. IQ Prep does not try to raise a score, and nothing here can promise a higher one.</p>

    <h2>A calm plan</h2>
    <ul>
      <li><b>Short and often.</b> Ten to fifteen minutes a few times a week, over two or three weeks, beats one long session.</li>
      <li><b>Start with Learn with Pip.</b> Tutor mode reads each question aloud, shows a worked example and explains every answer.</li>
      <li><b>Then practise.</b> Practice adapts to your child, aims for mostly wins and eases off after misses. Children under 9 get a gentler version.</li>
      <li><b>Try one challenge near the end.</b> Challenges use test-style order, timing and stopping rules, so your child feels how a session flows.</li>
      <li><b>Keep the last few days light.</b> A tired child does not show what they know.</li>
    </ul>

    <h2>What to avoid</h2>
    <ul>
      <li>Treating practice as pass or fail, or promising rewards for a score.</li>
      <li>Hunting online for real test questions. They are protected, and a child who has seen them can make a result hard to interpret.</li>
      <li>Pushing through tears. Stop, praise the effort, and come back another day.</li>
    </ul>

    <h2>What to tell your child</h2>
    <p>Something simple and true: they will do puzzles and answer questions with a friendly grown-up. Some questions are meant to be too hard for everyone, so it is fine to say \u201cI don\u2019t know\u201d and move on. There is nothing to study and nothing to win.</p>

    <h2>The day before and the day of</h2>
    <ul>
      <li>A normal bedtime and a normal breakfast.</li>
      <li>Glasses or hearing aids if your child uses them.</li>
      <li>A bathroom stop before starting, and a snack for any break.</li>
      <li>Your calm. Children read it.</li>
    </ul>

    <h2>About the numbers in IQ Prep</h2>
    <p>Reports show practice estimates on a familiar scale so you can see strengths and progress. They come from practice items, not a standardised test given by a trained examiner, so they are not IQ scores and should not be used to make decisions.</p>
''' + NOTE + '''
    <p class="guide__next"><a class="btn btn--primary" href="/play/">Start with Learn with Pip</a> <a href="/guides/">All guides</a></p>
  </main>
'''
page("guides/before-a-test/", "Using IQ Prep well before a test | IQ Prep",
     "How to help a child get familiar with IQ-style questions calmly: a short plan, what to avoid, what to tell them, and what the practice numbers mean.", before, 2)

cards = [("before-a-test", "Using IQ Prep well before a test", "A calm plan, what to avoid, and what to tell your child.")] + \
        [(a[0], a[2], a[3]) for a in AREAS]
index = '''  <main id="main" class="container doc guide">
    <h1>Guides for parents</h1>
    <p class="lead">What each kind of IQ-style question looks like, how to explain it, and simple ways to practise at home.</p>
    <ul class="guide__cards">
''' + "\n".join(f'      <li><a href="/guides/{s}/"><b>{e(t)}</b><span>{e(x)}</span></a></li>' for s, t, x in cards) + '''
    </ul>
''' + NOTE + '''
  </main>
'''
page("guides/", "Guides for parents: IQ-style questions explained | IQ Prep",
     "Parent guides to WISC-style and IQ-style question types: words and ideas, shapes, patterns, memory, speed, and how to prepare calmly.", index, 1)
print("guides:", ["guides/"] + [f"guides/{s}/" for s, *_ in cards])
