# Utah Canyon Country · October 12–23, 2026

Trip site for a Fort Collins → Utah → Fort Collins loop. Six travelers: two parents,
both grandparents, a three-year-old, and a newborn.

Live site: **https://jdfree.github.io/utah-2026/**

## Editing

All content lives in one file: [`data/itinerary.json`](data/itinerary.json). Edit it,
commit, push — GitHub Pages redeploys in about a minute. No build step, no dependencies
to install.

Days of the week are derived from each day's `date`, not stored — change a date and the
weekday follows automatically everywhere it appears.

An item with `"optional": true` renders set back behind a dashed rule with an "Optional"
badge. Use it for side trips the group hasn't committed to; promote one by deleting the
flag, drop it by deleting the item.

### The day is a timeline, not a list of attractions

Every day accounts for its own time. There are three kinds of row:

| `kind` | Fields | Renders as |
| --- | --- | --- |
| *(none)* | `dwell` | An attraction, with a "1 hr 30 min here" badge |
| `"drive"` | `dist`, `dur` | A muted leg with a car icon: **80 mi · 1 hr 30 min** |
| `"meal"` | `dwell` | A muted row with a fork icon |

**The rule that keeps it honest: `time` is when you arrive, and every row must finish
before the next one starts.** Adding an attraction means adding the drive leg to reach it
and pushing everything after it back. Change one thing and the rest of the day moves.

Two invariants, both checked below: every day has a lunch near noon and a dinner between
5:00 and 6:30 PM — early dinners are deliberate, so that sunsets never collide with a
hungry three-year-old.

```bash
python3 - <<'EOF'
import json, re
P = json.load(open('data/itinerary.json'))
t2m = lambda s: (lambda m: None if not m else (int(m[1])%12 + (12 if m[3]=='PM' else 0))*60 + int(m[2]))(
    re.match(r'~?(\d{1,2}):(\d{2})\s*(AM|PM)', s.strip()))
dur = lambda s: 0 if not s or s=='—' else (
    int(re.search(r'(\d+)\s*hr',s)[1])*60 if re.search(r'(\d+)\s*hr',s) else 0) + (
    int(re.search(r'(\d+)\s*min',s)[1]) if re.search(r'(\d+)\s*min',s) else 0)
for d in P['days']:
    prev = None
    for i in (x for x in d['items'] if not x.get('optional')):
        st = t2m(i['time'])
        if st is None: continue
        if prev and st < prev[1] + dur(prev[0].get('dur') or prev[0].get('dwell') or '') - 1:
            print(f"Day {d['day']}: {prev[0]['title'][:40]!r} overruns {i['title'][:40]!r}")
        prev = (i, st)
    meals = [t2m(i['time']) for i in d['items'] if i.get('kind') == 'meal']
    if not any(m and 11*60 <= m <= 12*60+40 for m in meals): print(f"Day {d['day']}: no lunch near noon")
    if not any(m and 17*60 <= m <= 18*60+30 for m in meals): print(f"Day {d['day']}: no dinner 5:00-6:30")
EOF
```

Drive distances and times come from OSRM, whose demo server runs about 25% slow — the
numbers here are scaled by **0.8**, which matches Google's estimates closely. `drive.stated`
on each day is the sum of its non-optional drive legs, so it is derived, not typed.

**Two places where OSRM must not be believed**, both on Day 2:

- **CO-145 between Telluride and Rico** is mis-speeded in OpenStreetMap. Every OSM-based
  router either reports ~3½ hours for a 76-mile paved state highway or detours 90 miles
  around it via Naturita. The real figure is **76 mi / ~1 hr 35 min**, confirmed against
  several independent sources. The route-check script below will flag Day 2 forever; that
  is the script being wrong, not the itinerary.
- **US-550 over Coal Bank, Molas and Red Mountain passes.** OSRM is optimistic on tight
  mountain roads. Day 2's legs are padded above what it reports.

If you add a leg on a mountain highway, sanity-check it against a real map rather than
trusting the number that comes back.

### Open questions

`openQuestions` is empty — everything raised against the printed plan was checked and
folded into the days themselves. To raise a new one, add an entry with a fresh `id`.
Mark it `"status": "resolved"` while the decision is fresh, then delete it once the
outcome is reflected in the itinerary.

### Mom's notes

Every annotation from the printed copy is numbered `M1`–`M20` in trip order and shown on
the day it belongs to, so they can be cited in conversation.

**Numbers come from position, so adding, moving or removing a note renumbers everything
after it — and any `(M12)`-style citation elsewhere in the file silently starts pointing
at the wrong note.** This has already rotted twice. After touching `momNotes`, re-audit
with:

```bash
python3 -c "import json,re;d=json.load(open('data/itinerary.json'));n={x['id']:t['day'] for t in d['days'] for x in (t.get('momNotes') or [])};[print(r,'->day',n.get(r,'DANGLING')) for r in sorted(set(re.findall(r'\bM\d+\b',json.dumps(d))),key=lambda s:int(s[1:]))]"
```

### Guide links

Each attraction item may carry a `guide` — a link to the page of whoever actually runs the
place. The renderer turns the item title into that link and appends an external-link icon.
Items without a `guide` (departures, drives, meals) render as plain text.

Prefer the managing agency, in this order, and fall back only when none of them has a page:

| Kind of place | Where the link should point |
| --- | --- |
| National park, monument, rec area | `nps.gov/<park>/planyourvisit/…` |
| Utah state park | `stateparks.utah.gov/parks/<park>/` |
| BLM land | `blm.gov/visit/<site>` |
| Commercial operator | its own site (`durangotrain.com`, `gouldings.com`) |
| Byways, towns, tribal park | `visitutah.com` |

The point is that the link is authoritative about **hours, closures and fees** — which is
what you actually need on the road. These pages are worth more than a photo was.

NPS slugs are not guessable and change over time: `parus-trail.htm`, `emerald-pools.htm`
and `dayhikes.htm` all 404 today. Don't invent one. Scrape the park's own index instead:

```bash
curl -sL -A 'Mozilla/5.0' https://www.nps.gov/zion/planyourvisit/index.htm \
  | grep -oE 'href="/zion/planyourvisit/[a-z0-9._-]+\.htm"' | sort -u
```

Then check every link still resolves — a 404 here is silent on the page:

```bash
python3 -c "import json;d=json.load(open('data/itinerary.json'));[print(i['guide']) for t in d['days'] for i in t['items'] if i.get('guide')]" \
  | sort -u | xargs -P4 -I{} curl -sS -o /dev/null -w '%{http_code} {}\n' -L --max-time 20 -A 'Mozilla/5.0' {}
```

### Packing

`packing` is a list of `{ group, items }`. Add a group by adding an object; the count in
the intro line is computed.

### Marking something as booked

Do it in the sheet, not here — flip that row's **Status** to `BOOKED` and the page picks it
up within five minutes. The `status` in `itinerary.json` is only the fallback shown when the
sheet is unreachable, so it is worth keeping roughly in step:

```json
{
  "id": "lodging-montrose",
  "what": "Home in Montrose, CO — night of Oct 12",
  "status": "booked"
}
```

**The `id` is the join key.** Renaming one here without renaming column J in the sheet
breaks the link silently — the page falls back to the committed status and prints a
callout naming the orphaned rows. Change both together.

`status` is one of `needed`, `booked`, or `optional`. The counts at the top of the Bookings
tab update automatically. Do not put `who` or `confirmation` in this file — those live in
the private tab of the sheet and are not rendered.

### Locking in a place to stay

Set `chosen` on that day's `lodging` object to the name of the option you booked, set
`status` to `"booked"`, and add a `checkin` line — the arrival window, the check-out
deadline and how you get in. It renders under the options and is the thing you actually
want on your phone at 7 PM:

```json
"lodging": {
  "city": "Cannonville, UT",
  "nights": [8, 9],
  "chosen": "The House at Pooh Corner — 115 S Kodachrome Rd, Cannonville",
  "status": "booked",
  "checkin": "Check in Mon Oct 19 from 3:00 PM · check out Wed Oct 21 by 11:00 AM · keypad self check-in"
}
```

Consecutive `nights` of three or more render as a range ("nights 4–7"); anything else
stays a list. Door codes and WiFi passwords never go in this file — the site is public.

For the second and later nights of the same stay, use `sameAsDay` instead of repeating
the options:

```json
"lodging": { "city": "Cannonville, UT", "nights": [8, 9], "status": "booked", "sameAsDay": 8 }
```

## Search engines

`robots.txt` disallows all crawlers and every page carries `noindex, nofollow`. The repo
and site are public — this keeps them out of search results, it does not make them
private. Note the two directives pull against each other slightly: a crawler that obeys
`robots.txt` never fetches the page, so it never sees the `noindex`. If a link to the
site ever leaks, a search engine can still list the bare URL. Belt and braces is what was
asked for and what is here.

## Running it locally

The page fetches JSON, so `file://` will not work — you need a server:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Map and daily routes

Each day card ends with a **Today's route** block: the chain of stops spelled out, plus a
Google Maps directions link built from them.

`stops` is a separate list from `items` and does not update itself — **if you change what
a day does, update its `stops` too, or the route silently goes stale.** Two rules keep it
honest: the first stop is where you wake up that morning, and the last is where you sleep.
Coordinates rather than place names, because they land in the right parking lot every time.

**The directions link reflects the day as scheduled.** An optional stop the clock already
assumes — Goosenecks, Cedar Breaks, Kodachrome — stays in the route. An optional stop that
would *displace* the schedule is a branch: mark it `"viaOptional": true` and it still shows
in the chain, greyed, but drops out of the Google Maps URL. Routing through Canyonlands
would report a day you are not planning to drive.

Check the routes against the stated totals — this is what catches stale stops:

```bash
python3 - <<'EOF'
import json, re, urllib.request, time
P = json.load(open('data/itinerary.json'))
for d in P['days']:
    pts = [s for s in d['stops'] if not s.get('viaOptional')]
    if len(pts) < 2 or d['day'] == 2: continue
    c = ';'.join(f"{s['lng']},{s['lat']}" for s in pts)
    r = json.load(urllib.request.urlopen(
        f"http://router.project-osrm.org/route/v1/driving/{c}?overview=false"))['routes'][0]
    mi, mn = r['distance']/1609.34, r['duration']/60*0.8       # 0.8 = demo-server correction
    st = d['drive']['stated']
    smi = float(re.search(r'(\d+) mi', st)[1])
    smn = (int(re.search(r'(\d+)\s*hr', st)[1])*60 if re.search(r'(\d+)\s*hr', st) else 0) + \
          (int(re.search(r'(\d+)\s*min', st)[1]) if re.search(r'(\d+)\s*min', st) else 0)
    if abs(mi-smi) > 8 or abs(mn-smn) > 15:
        print(f"Day {d['day']}: route is {mi:.0f} mi / {mn:.0f} min, header says {st}")
    time.sleep(0.4)
EOF
```

Leaflet with OpenStreetMap tiles — no API key, no billing account, nothing to expire.
Pins are numbered by day and clicking one jumps to that day's card. Coordinates live in
`itinerary.json` and are approximate, meant for orientation. Each day card also has an
"Open in Google Maps" link that builds a real directions URL from that day's stops, which
is what you'd actually navigate with.

A Google My Maps version was trialled and dropped: it showed no route line, could not link
pins to days, and was a separate copy that did not track `itinerary.json`.

## Bookings

Two places, deliberately:

- **The Bookings tab on this site** is a read-only snapshot from `itinerary.json`. It only
  changes when the repo does.
- **[The shared Bookings Tracker](https://docs.google.com/spreadsheets/d/1N2r62ysrne-hRmPgi4nLXrrivAYXYYo6BxRDGzwjusM/edit)**
  is the live one. Anyone in the group claims a job by putting their name in *Who's
  booking*, then fills in *Confirmation #* and *Cost* and flips *Status* to `BOOKED`.

**Only the Status column reaches the site.** *Who's booking*, *Confirmation #* and *Cost*
are deliberately not published and are not shown in the table, so the site never carries a
confirmation number. The practical consequence is worth stating plainly, because it has
already caught someone out: filling in the confirmation and the cost changes nothing on the
page. It is the Status cell that has to move from `NEEDED` to `BOOKED`.

The sheet is Restricted — only people it is shared with can open it. That also means this
public, static site cannot read it directly: an anonymous browser has no credentials.

### How live status reaches the page

The sheet has two tabs:

- **Bookings** — the private one. Who's booking, confirmation numbers, costs, notes.
  Restricted sharing; never published.
- **Public status** — two columns only, `id` and `status`, filled by
  `=FILTER(Bookings!J:J, Bookings!J:J<>"", Bookings!J:J<>"ID")` so it tracks the private tab
  automatically. This tab alone is published to the web as CSV, so the page can read it
  without anyone signing in. No names, no confirmation numbers, no costs are ever exposed.

  **Use whole-column ranges, not `J2:J`.** Inserting a row at the top of the Bookings tab
  makes Google rewrite a `J2:J` reference to `J4:J` to keep it pointing at the original
  cells — which silently drops the new top rows from the published CSV while the page still
  reports itself Live. That has happened once. Whole-column references cannot be shifted.

`trip.bookingsStatusCsv` in `itinerary.json` holds that CSV URL. On load the page fetches
it and overrides the statuses baked into the JSON. If the fetch fails — not published yet,
offline, CORS — the page silently falls back to the committed snapshot and says so.

Rows are matched on `id`, not on the item text, so rewording or reordering rows in the
sheet is safe. If an id in `itinerary.json` has no matching sheet row, the page raises a
callout naming it — a partial sync is more dangerous than a total failure, because the page
otherwise looks healthy while quietly showing stale statuses.

Google serves the published CSV with `max-age=300`, so a status change takes up to five
minutes to appear. Before concluding something is broken, check the CSV directly:

```bash
curl -sSL "$(python3 -c "import json;print(json.load(open('data/itinerary.json'))['trip']['bookingsStatusCsv'])")"
```

### Re-publishing the status tab

If the CSV URL ever stops working, in the sheet: **File › Share › Publish to web**, set
the left dropdown to **Public status** (never "Entire document" — that would expose the
private tab) and the right to **Comma-separated values (.csv)**, then Publish. Paste the
URL Google gives you into `trip.bookingsStatusCsv`.

### Adding a booking

Add it to `bookings` in `itinerary.json` with a new `id`, then add a row to the sheet's
Bookings tab with that same id in column J. The Public status tab picks it up on its own.

## Where the content came from

The cowork-generated plan, plus Mom's handwritten annotations on the printed copy.
Her notes are preserved verbatim in the `momNotes` field on each day, so nothing she
wrote gets lost as the plan changes.

The printed plan had real errors — drive times off by hours, the Zion shuttle backwards,
a Day 10 route that doubled back, two lodgings that were not what they claimed. Those were
tracked as numbered questions, checked one by one, and the corrections now live in the days
themselves. The reasoning is in the git history if you ever need to know why something
changed.
