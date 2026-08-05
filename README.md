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

### Photo links

Each attraction item may carry an `image` — a link to the Wikipedia/Commons **file page**
for a photo of it, not to the image file. That page carries the licence and the
photographer's credit, and Wikimedia asks that their image servers not be hotlinked from
other sites. The renderer turns the item title into that link and appends a camera icon.
Items without an `image` (departures, drives, meals) render as plain text.

To add one, find the attraction on Wikipedia and use its lead image:

```bash
curl -s -H 'User-Agent: your-contact' \
  'https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=name&redirects=1&titles=Delicate%20Arch'
```

Then set `"image": "https://en.wikipedia.org/wiki/File:<name with underscores>"`.

### Packing

`packing` is a list of `{ group, items }`. Add a group by adding an object; the count in
the intro line is computed.

### Marking something as booked

Find the entry in the `bookings` array and change it:

```json
{
  "what": "D&SNG Cascade Canyon steam train (6 seats, Oct 13)",
  "status": "booked",
  "who": "your name",
  "confirmation": "ABC-12345"
}
```

`status` is one of `needed`, `booked`, or `optional`. The counts at the top of the
Bookings tab update automatically.

### Locking in a hotel

Set `chosen` on that day's `lodging` object to the name of the option you booked, and
set `status` to `"booked"`:

```json
"lodging": {
  "city": "Springdale, UT",
  "nights": [4, 5],
  "chosen": "Cable Mountain Lodge",
  "status": "booked"
}
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

The sheet is Restricted — only people it is shared with can open it. That also means this
public, static site cannot read it directly: an anonymous browser has no credentials.

### How live status reaches the page

The sheet has two tabs:

- **Bookings** — the private one. Who's booking, confirmation numbers, costs, notes.
  Restricted sharing; never published.
- **Public status** — two columns only, `id` and `status`, filled by
  `=FILTER(Bookings!J2:J, …)` so it tracks the private tab automatically. This tab alone is
  published to the web as CSV, so the page can read it without anyone signing in. No names,
  no confirmation numbers, no costs are ever exposed.

`trip.bookingsStatusCsv` in `itinerary.json` holds that CSV URL. On load the page fetches
it and overrides the statuses baked into the JSON. If the fetch fails — not published yet,
offline, CORS — the page silently falls back to the committed snapshot and says so.

Rows are matched on `id`, not on the item text, so rewording a row in the sheet is safe.
If an id in `itinerary.json` has no matching sheet row, the page names it in a warning
rather than silently ignoring it.

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
