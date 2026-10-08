"""Stamp each itinerary item with the forecast for where you'll be at that time.

    python3 tools/weather.py            # fetch, write data/itinerary.json, print a table

Open-Meteo gives hourly forecasts 16 days out, free, no key. It adjusts
temperature for each coordinate's own elevation, which matters here: the Bryce
rim sits 2,000 ft above the house in Cannonville. Re-run it as departure gets
closer — anything more than about a week out is a rough guide, not a forecast.

Every time in the itinerary is Utah time (Mountain Daylight), Page included, so
the forecast is requested on that one clock rather than each place's own.
"""
import collections, json, re, sys, urllib.parse, urllib.request
from datetime import date, datetime, timedelta

PATH = "data/itinerary.json"
API = "https://api.open-meteo.com/v1/forecast"
TZ = "America/Denver"

# Where you are depends on the drives: each one carries you to the next stop in
# the day's chain, skipping the optional side trips. Two days do not follow the
# chain — the Zion shuttle legs are not stops, and Day 10 doubles back to
# Balanced Rock for dinner — so their drive destinations are spelled out.
ZION_VC, ZION_LODGE = (37.2002, -112.9866), (37.2509, -112.9572)
WEEPING_ROCK, SINAWAVA = (37.2717, -112.9378), (37.2853, -112.9479)
CASITAS = (37.14764, -113.47804)
DRIVE_TO = {
    5: [ZION_VC, ZION_LODGE, WEEPING_ROCK, SINAWAVA, ZION_VC, CASITAS],
    10: ["Goblin Valley", "Green River", "Park Avenue", "Balanced Rock",
         "Delicate Arch", "Balanced Rock", "Moab"],
}

# WMO weather codes, in plain words.
WMO = {0: "clear", 1: "mostly clear", 2: "partly cloudy", 3: "cloudy",
       45: "fog", 48: "freezing fog", 51: "light drizzle", 53: "drizzle",
       55: "heavy drizzle", 56: "freezing drizzle", 57: "freezing drizzle",
       61: "light rain", 63: "rain", 65: "heavy rain", 66: "freezing rain",
       67: "freezing rain", 71: "light snow", 73: "snow", 75: "heavy snow",
       77: "snow grains", 80: "rain showers", 81: "rain showers",
       82: "heavy showers", 85: "snow showers", 86: "heavy snow showers",
       95: "thunderstorms", 96: "thunderstorms, hail", 99: "thunderstorms, hail"}
WET = {51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99}


def minutes(s):
    """'2 hr 35 min' / '25 min by shuttle' -> 155 / 25."""
    h = re.search(r"(\d+)\s*hr", s or ""); m = re.search(r"(\d+)\s*min", s or "")
    return (int(h[1]) * 60 if h else 0) + (int(m[1]) if m else 0)


def clock(day, t):
    return datetime.combine(date.fromisoformat(day["date"]), datetime.strptime(t, "%I:%M %p").time())


def locate(day):
    """(item, coordinate, when) for every item in the day."""
    main = [s for s in day["stops"] if not s.get("viaOptional")]
    side = [s for s in day["stops"] if s.get("viaOptional")]
    named = lambda key: next((s["lat"], s["lng"]) for s in day["stops"] if key in s["name"])
    plan = DRIVE_TO.get(day["day"])
    dests = ([p if isinstance(p, tuple) else named(p) for p in plan] if plan
             else [(s["lat"], s["lng"]) for s in main[1:]])
    drives = [i for i in day["items"] if i.get("kind") == "drive"]
    assert len(drives) == len(dests), f"Day {day['day']}: {len(drives)} drives, {len(dests)} destinations"

    here, legs, out = (main[0]["lat"], main[0]["lng"]), iter(dests), []
    for it in day["items"]:
        when = clock(day, it["time"])
        if it.get("kind") == "drive":
            here = next(legs)
            when += timedelta(minutes=minutes(it.get("dur")))   # what you step out into
            out.append((it, here, when)); continue
        # an optional side trip with a pin of its own is forecast there, not on the main road
        stem = it["title"].split(",")[0].split(" — ")[0]
        alt = next(((s["lat"], s["lng"]) for s in side if s["name"].startswith(stem)), None)
        out.append((it, alt or here, when))
    return out


def fetch(points, start, end):
    q = {"latitude": ",".join(f"{p[0]}" for p in points),
         "longitude": ",".join(f"{p[1]}" for p in points),
         "hourly": "temperature_2m,weather_code,precipitation_probability",
         "temperature_unit": "fahrenheit", "timezone": TZ,
         "start_date": start, "end_date": end}
    req = urllib.request.Request(API + "?" + urllib.parse.urlencode(q),
                                 headers={"User-Agent": "utah-2026-trip-site"})
    with urllib.request.urlopen(req, timeout=60) as r:
        body = json.load(r)
    body = body if isinstance(body, list) else [body]
    return {p: b["hourly"] for p, b in zip(points, body)}


def main():
    d = json.load(open(PATH), object_pairs_hook=collections.OrderedDict)
    placed = [x for day in d["days"] for x in locate(day)]
    points = sorted({p for _, p, _ in placed})
    series = fetch(points, d["days"][0]["date"], d["days"][-1]["date"])

    rows = []
    for it, p, when in placed:
        h = series[p]
        stamp = when.replace(minute=0) + timedelta(hours=when.minute >= 30)   # nearest hour
        try:
            k = h["time"].index(stamp.strftime("%Y-%m-%dT%H:%M"))
        except ValueError:
            it.pop("wx", None); continue            # past the end of the forecast window
        temp, code, pop = h["temperature_2m"][k], h["weather_code"][k], h["precipitation_probability"][k]
        if temp is None or code is None:
            it.pop("wx", None); continue
        wx = collections.OrderedDict([("temp", round(temp)), ("cond", WMO.get(code, "unsettled"))])
        if pop is not None and pop >= 30 and code not in WET:
            wx["pop"] = pop                          # only worth saying when it is a real chance
        # keep `wx` beside the description it annotates
        rest = collections.OrderedDict((k2, v) for k2, v in it.items() if k2 != "wx")
        it.clear()
        for k2, v in rest.items():
            it[k2] = v
            if k2 == "detail": it["wx"] = wx
        rows.append((when, it["title"], p, wx))

    d["trip"]["forecastAsOf"] = date.today().isoformat()
    with open(PATH, "w") as f:
        json.dump(d, f, indent=2, ensure_ascii=False); f.write("\n")

    for when, title, p, wx in rows:
        pop = f"  {wx['pop']}% precip" if "pop" in wx else ""
        print(f"{when:%a %b %d %H:%M}  {wx['temp']:>4}°F  {wx['cond']:<16}{pop:<14} {title[:46]}")
    print(f"\n{len(rows)} items stamped from {len(points)} forecast points; "
          f"{len(placed) - len(rows)} had no forecast yet.", file=sys.stderr)


if __name__ == "__main__":
    main()
