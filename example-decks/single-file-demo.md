---
title: One File, One Deck
author: Lecta Team
theme: executive
---
---
layout: title
---
# One File, One Deck

### Write a whole presentation in a single Markdown file

Open this file in Lecta and it becomes a real deck folder —
`lecta.yaml`, `slides/*.md`, `code/*` — with nothing lost.

<!-- notes -->
Open with **File → Open** and pick this `.md` file. Lecta materializes a folder
called `single-file-demo/` right next to it and opens that. The folder is the
canonical format; this file is just the fastest way to start.

---
layout: two-col
transition: left
---
# How it works

Three rules, and that is the whole format:

1. A line that is exactly `---` starts a new slide.
2. An optional YAML block right after a separator configures the slide that follows —
   `layout`, `transition`, `notes`, `skip`, `id`, `title`.
3. The first block of the file is the deck frontmatter.

A longer run of dashes is just a horizontal rule, so this splits nothing:

----

Fenced code without a `file=` stays inline, exactly as you typed it:

```yaml
title: My Talk
theme: executive
```

<!-- notes -->
Two columns are filled top to bottom: everything before the halfway point of the
content lands on the left. Keep each column short.

---
# Python that runs

The fence below carries `file=`, so Lecta pulls it out into `code/histogram.py`
and attaches it to this slide as a runnable code block.

```python file=histogram.py execution=pyodide packages=[numpy]
import numpy as np

samples = np.random.default_rng(7).normal(size=500)
counts, edges = np.histogram(samples, bins=8)

for count, edge in zip(counts, edges):
    print(f"{edge:6.2f} | {'#' * int(count)}")
```

<!-- notes -->
Pyodide is the default engine for Python, so `execution=pyodide` above is
optional — it is spelled out here to show the syntax. `packages=[numpy]` is
installed in the browser on first run, which takes a few seconds.

---
# Run it your way

`execution=`, `command=` and `args=` map straight onto `lecta.yaml`. Native
execution stays off until you enable it in Settings.

```javascript file=code/report.js execution=native command=node args=[code/report.js]
const rows = [
  { region: 'EMEA', revenue: 4.2 },
  { region: 'AMER', revenue: 6.1 },
  { region: 'APAC', revenue: 3.4 }
]

const total = rows.reduce((sum, r) => sum + r.revenue, 0)
for (const row of rows) {
  const share = ((row.revenue / total) * 100).toFixed(1)
  console.log(`${row.region}  $${row.revenue}M  ${share}%`)
}
```

<!-- notes -->
`file=` may name a folder (`code/report.js`) or just a file name
(`histogram.py`, which lands in `code/` automatically).

---
skip: true
---
# Back to one file

**Deck → Export as single Markdown file** turns any deck folder back into a file
like this one — frontmatter, per-slide blocks, code fences and notes included.

This slide carries `skip: true`, so it is kept in the deck but stepped over
while presenting. Handy for backup slides.

<!-- notes -->
Skipped slides still appear in the slide sorter, greyed out.
