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

### Marking something as booked

Find the entry in the `bookings` array and change it:

```json
{
  "what": "D&SNG Cascade Canyon steam train (6 seats, Oct 13)",
  "status": "booked",
  "who": "James",
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

### Closing an open question

Delete the entry from `openQuestions`, or change its `status` to `"resolved"` and add
what you decided to the `detail`.

## Running it locally

The page fetches JSON, so `file://` will not work — you need a server:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Maps

The Map tab has two views, toggled at the top.

**Google map** (default) — an embedded [Google My Maps](https://www.google.com/maps/d/viewer?mid=1e3rqyxdEOjtbtPsxmfnKcKxQTT1IG48)
with one layer per day, so days can be switched on and off in its legend. It lives in
james.free@gmail.com's Drive and is set to "anyone with the link can view" (not
search-indexed). It is a *separate copy* of the route — editing `itinerary.json` does not
update it. To regenerate, rebuild the KML and re-import it as a new layer in My Maps.
The embed shows the map owner's name in its title bar; that is Google's behaviour and
cannot be turned off.

**Trip pins** — Leaflet with OpenStreetMap tiles, no API key. Pins are numbered by day
and clicking one jumps to that day's card, which the Google embed cannot do. Built lazily
the first time you open the tab. Coordinates come from `itinerary.json`, so this view
always matches the data.

Each day card also has an "Open in Google Maps" link that builds a real directions URL
from that day's stops.

## Where the content came from

The cowork-generated plan, plus Mom's handwritten annotations on the printed copy.
Her notes are preserved verbatim in the `momNotes` field on each day and collected on
the "Notes & questions" tab, so nothing she wrote gets lost as the plan changes.

The `openQuestions` list flags places where the printed plan looks wrong — drive times,
the Day 10 stop order, the Zion shuttle assumption — that should be checked before
money changes hands.
