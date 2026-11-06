# Contributing to Nepean HS Navigator

The app uses plain HTML, CSS, and JavaScript ES modules. There is no framework, build step, or dependency installation. Node.js is needed only to run the tests, and Python 3 only to serve the app locally and to regenerate map geometry.

Coding agents should also read [AGENTS.md](AGENTS.md) for implementation constraints and detailed verification steps.

## Run it locally

With Python 3 installed, run this command from the repository folder:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Visit http://localhost:8000/, edit files, and reload the page. Stop the server with **Ctrl+C** in its terminal. Opening `index.html` directly will not work correctly because JavaScript modules and offline support need HTTP. Production offline support requires HTTPS.

## Files

| File | Purpose |
| --- | --- |
| [data.js](data.js) | Buildings, floor connections, junctions, stairs, entrances, and special destinations (plain data only) |
| [map-geometry.js](map-geometry.js) | Generated from the master SVG: building outlines, per-floor hallway centerlines, stairwell and step positions, ports between buildings, entrances, and room markers |
| [floor-map.js](floor-map.js) | Snaps room-interpolation lines onto the generated centerlines, traces hallway paths, selects staircases, and builds composite maps |
| [route-map.js](route-map.js) | SVG rendering and phone route framing |
| [routing.js](routing.js) | Room parsing, route finding, and written directions |
| [app.js](app.js) | Room entry, results, room-number cards, and help dialogs |
| [install.js](install.js) | App installation controls and service-worker registration |
| [index.html](index.html) and [style.css](style.css) | Page content, structure, and appearance |
| [manifest.webmanifest](manifest.webmanifest) and [icons/](icons/) | App installation details and icons |
| [sw.js](sw.js) | Offline caching and app updates |
| [tools/floorplans.svg](tools/floorplans.svg) | Master Inkscape drawing of all four floors |
| [tools/export_floor_svgs.py](tools/export_floor_svgs.py) | Exports each floor layer, without editor metadata or data-only elements, to `public/floor-0.svg` through `public/floor-3.svg` |
| [tools/extract_svg_map.py](tools/extract_svg_map.py) | Generates `map-geometry.js` from the named features in the master drawing, and optionally writes SVG observations to JSON for review |
| [tests/](tests/) | Automated routing, map, and offline-cache checks |
| [references/maps/](references/maps/) | Source images used to draw the map (not deployed) |

## Updating the floor plans

`tools/floorplans.svg` is the master Inkscape drawing. Where it and `data.js` disagree about the map, the drawing wins. After editing it, regenerate both outputs and run the tests:

1. Export the four floor layers: `python3 tools/export_floor_svgs.py`.
2. Regenerate the map geometry: `python3 tools/extract_svg_map.py --module-output map-geometry.js`. This rasterizes the named hallway areas, thins them to medial-axis centerlines, splits them between buildings, and reads the other named features. It stops with an error for a misnamed feature, and prints a warning for a hallway in disconnected pieces or far from every building. Add `--output <file>.json` to also write review observations.

`floor-map.js` snaps the room-interpolation lines in `data.js` onto the generated centerlines, projects route landmarks onto the nearest connected centerline segments, and restores entrance badge artwork over clipped floor layers. The drawing supplies positions only. Routing still comes only from `school.connections` and `school.staircases`, and the wording from `data.js`; overlapping rectangles in the artwork do not create graph connections. Cache and stage any new deployed assets.

### Drawing rules for floorplans.svg

The tools read element `id`s, so set the ID itself, not just the Inkscape label. Every feature name ends in `-<floor>`, and the extractor stops if that does not match the layer it is in.

- **Canvas and layers.** One layer per floor, labelled `0_floor` to `3_floor`. Keep the viewBox and alignment unchanged, because the app maps it onto a 773 x 742 canvas. Hidden layers are fine; the tools ignore editing visibility.
- **Buildings.** One `building-<b>-<floor>` rectangle for each building on each floor it has. Extra rectangles take a letter suffix, as in `building-1b-1`. A building's outline is the union of its rectangles on every floor.
- **Hallways.** Groups named `hallway-<floor>` or `hallway<b>-<floor>`, drawn as closed straight-sided paths or rectangles; curves are ignored. Each floor needs at least one. The centerline is split between buildings by their outlines (the deepest one, where outlines overlap). A piece outside every outline goes to the nearest building within 100 units. Keep each building's hallway in one connected piece.
- **Ports.** Where two buildings' hallways come within 30 units on the same floor, the extractor records a port between them. Every connection in `data.js` needs a port at both ends, which the tests check.
- **Open areas.** A building floor that is one large room, currently only the Cafeteria (1-1), has no hallway drawn and is marked `openArea: true` in `data.js`. The map draws straight lines across it. Every other mapped floor except Main's unsurveyed basement must have a hallway.
- **Stairwells.** One `gstairs-<label>-<floor>` group on every floor the stairwell serves. The group's centre is the landing. The label and floors must match `staircases` in `data.js`.
- **Steps.** One `steps-<name>-<extent>-<floor>` group per set of steps, where `<extent>` is `half-flight`, `flight`, `full-flight` (the same as `flight`) or `<n>-steps`, as in `steps-g139-3-steps-2`. Each group contains exactly one red arrow (a red path with `marker-end`) and one `UP` or `DN` label. Uphill is the arrow's direction for `UP` and the reverse for `DN`. Hallway staircases in `data.js` name their steps with `steps: '<name>'`, and must be drawn on both floors rising the same way.
- **Stairs and steps belong to a building.** Each one belongs to the building containing its centre, or the nearest building within 100 units.
- **Entrances.** One `entrance-<letter>-<floor>` group containing the badge square and letter. Each entrance in `data.js` must be drawn on its floor. The floor 1 badges are redrawn over clipped plans.
- **Rooms.** An optional `room-<number>` marker (a circle or ellipse, or a group containing one) at the room's door, on the layer for the room's floor digit and beside its building. It replaces the interpolated position. A descriptive suffix such as `room-1304-stage` is allowed and ignored; names shown in the app come from `data.js`. A marker on a different floor's layer is ignored with a warning.
- **Data-only elements.** `room-*`, `rooms-*` and `approach-*` elements, and any `<floor>_data` sublayer such as `2_data`, are removed from the `public/` images. Draw them in any style that is easy to edit.
- **Artwork.** Street names, the compass, building names and other artwork are not read. Do not use the red arrow style for anything inside a `steps-*` group except its arrow.

## Open survey questions

These need checking in the building before the drawing or `data.js` can be completed or treated as confirmed. Node IDs are `building-floor`.

**Routes not yet known**
- **Main's basement (2-0).** How you get down to it is unknown. No hallway is drawn, and stairwells A and B are not drawn on floor 0 although `data.js` lists them there.
- **Music room (3-0).** The route is unclear, including whether stairwell `gstairs-music-0` leads there.
- **Guidance (2201).** How you get from the floor 2 hallway to the door is unclear, so the drawing cannot describe it; its directions are hand-written in `data.js`. The `room-2201` marker sits just south of stairwell B.
- **Cafeteria floor (1-1).** It is mapped as one open room. Its other rooms and exits are unknown.
- **Cafeteria room number.** The app treats the Cafeteria as room 2103 on floor 2, but its `room-2103-cafeteria` marker is drawn on floor 1, so the marker is ignored. Which floor is the Cafeteria's door on, and is 2103 its number?

**Rooms**
- Many room positions in building 3, floors 1 and 2, do not follow the numbering order and are estimates.
- The Office room number (2202) is provisional.

**Drawing features to explain**
- **Art/Main junction, floor 2.** Three half-flights are drawn along the junction (`steps-g63`, `steps-g159` and `steps-g134`), and `data.js` adds a half-flight down from Main into Art/English. The directions follow the drawing: between the Art rooms and Main they go down `steps-g63` and up into Main, and from Entrance C they climb `steps-g134` and `steps-g159`. Are those flights and their directions right?
- **Building 3 hallway stairs, floor 2.** Two overlapping groups are drawn: `steps-g224` (DN) and `steps-g225` (UP). Is that one set of steps or two?
- **Entrances G and M.** They are drawn on floor 1 but are not in `data.js`. Are they usable entrances?

**Taken from the drawing but not confirmed on site**
- Stairwell E is at the far end of the Art/English hallway (the directions call it the south end).
- The rise inside Entrance N is a full flight.
- On floor 1, building 3 meets building 4 by a half-flight; the 3 steps between them are on floor 2 only.
- The Gym corridor joins building 4's hallway near stairwell I.

**Directions**
- All connections between buildings are unverified, and left/right turns need checking along every route.

## How routing and the map work

`navigate(start, end)` validates each endpoint once and returns `{start, end, path, steps}`. The UI and map use this same route object. Breadth-first search finds the route with the fewest graph edges, where graph nodes are `building-floor`.

At mapped hallway junctions, `routing.js` calculates turns from the direction of arrival and the direction of departure; reverse travel reverses the turn. On floors marked `drawnDirections` (Art/English floor 2), the directions instead name each turn and hallway step along the traced route, joining steps with no turn between them into one phrase. Elsewhere, turns in the drawing and approaches to stairwells do not become spoken turns.

`floor-map.js` has no browser dependencies: it traces the route and records selected stairwell movements. `route-map.js` draws the route without recomputing routing decisions. The map shows the whole complex, with the relevant floors for buildings along the route and ground-floor drawings for the remaining buildings. At a stairwell, adjacent floor drawings are clipped and overlaid at the landing within one map; floors are never shifted, even when their landings are drawn a few units apart. Only genuine route overlaps or missing landing geometry require a continuation below. Compatible floors in one building share a drawing.

Rooms with a `room-*` marker in the drawing use it. Other room dots are estimated along the hallway centerlines: numbers increase south to north (left to right on the drawing), or east to west (bottom to top). Named exceptions show an approach point rather than an invented exact room location. Where a hallway is not drawn, such as Main's basement, that segment is left undrawn and the map refers to the written directions.

A route may use any equally valid nearest stairwell when the written directions offer a choice; the display selects the closest allowed option along the traced hall from the estimated entry point. The images are approximate, and the composite does not establish step-free access or verified individual room locations.

## Editing the school data

`data.js` stores the human-readable school, connection, stair, and destination information. Room numbers use **floor-building-room digits**, while graph node IDs use **building-floor**. For example, room `2412` belongs to node `4-2`. Check school-map corrections against the actual building before treating them as confirmed.

**Buildings.** Each building has `name`, `highRoom` (the highest two-digit room suffix), `lowestFloor`, and `highestFloor`, with inclusive limits. Input validation accepts suffixes from 01 through `highRoom` and floors within that building's range, and still requires a mapped building/floor node. These bounds do not verify individual rooms or create missing connections. The per-building room limit currently applies on every floor. Building 5 uses floor 1, including the Gym preset `1509`.

**Staircases.** Each building's `staircases` object is keyed by staircase label, for example `J: {side: "west", floors: [0, 1, 2]}`. Each staircase connects every pair of its listed floors. Use `kind: "hallway"` for hallway steps that should not receive a stairwell badge, with `steps` naming their `steps-*` group in the drawing; optional `extent` and `position` fields describe the stair length and its side within the hall.

**Connections.** Connections are a list of `{from, to}` objects using graph node IDs, with optional `stairs: {direction: "down", extent: "half-flight"}` and `turn` metadata. Stair and turn directions describe travel from `from` to `to`; reverse travel swaps `up`/`down` and `left`/`right`. A turn may be a string such as `"left"`, or an object such as `{direction: "left", hallway: "north-south hallway"}` when the destination hallway has a useful name, or `{junction: "main-music"}` to take the turn from that junction's recorded transition. Set `afterStairs: true` when the turn occurs after the connecting stairs. Turns are only spoken when explicitly recorded, or on a `drawnDirections` floor. Use `direction: "unknown"` when stairs are known but their direction is not. Omit `stairs` when no stair instruction is mapped; this does not establish step-free access. Connections are automatically bidirectional and remain one graph edge regardless of connecting stairs. The Gym connects directly to Building 4's hallway near stairwell I on floor 1.

**Entrances.** `school.entrances` maps door letters to `building`, `floor`, and hallway `side`, with an optional `staircase` label. `floor` is the logical room-routing floor; optional `doorFloor` records a different physical door level. `approachInstruction` supplies a distinctive verbal entrance approach, while `approachStairs` describes an entrance rise without adding a graph edge. Stairwell sides come from the existing staircase metadata. Entrance positions guide the instructions; they do not add graph edges or exact hallway geometry.

**In-floor stairs.** `school.inFloorStairs` records physical rises within one logical floor, such as Building 3's level 1.5 to level 2 rise. Its `between` nodes identify the corridor segment where the instruction is included; this does not create a new room floor or graph edge.

**Named destinations.** `school.knownRooms` gives names and special instructions. Destinations can supply `arrivalStairs` or `departureStairs` objects with `kind: "stairwell"` and `direction` for stairs outside the graph, such as Guidance's half-level. Their written `arrival`/`departure` instructions remain the full description.

**Route overrides.** `school.routeInstructions` can replace generated wording for one specific entrance-to-room route. Each override includes the expected graph `path`, so it is ignored if routing changes; it changes directions only, not connectivity or the displayed map.

`school.routeTurnDirections` records confirmed turns for a room-to-room approach when the connection defaults do not fit. Its `turns` list follows the edges of the expected `path`, with `null` for an edge that keeps its default. Reverse travel reverses the list and swaps left/right; other room or entrance approaches keep their own directions. An explicit `afterStairs` value orders a turn relative to the stairs when travelling from `from` to `to`. Reverse travel swaps that order too: a turn after the descent becomes a turn before the ascent. Left/right wording is relative to travel and omits compass-facing qualifications.

## Check your changes

With Node.js 22 or newer installed, run:

```sh
node --test
```

Also try your changes in a browser, including a narrow mobile view and keyboard navigation. For changes to offline behaviour, let the app install online, switch the browser to offline mode, reload, and request a route.

When changing any deployed app asset, bump `VERSION` in `sw.js` so returning users receive the update. Documentation-only changes do not need a version bump. New versions wait for existing app tabs to close; close all app tabs/windows and reopen online to update. If cached files hide local edits, unregister the service worker and clear this site's cache in browser DevTools.

## Publishing

The repository includes a [GitHub Pages workflow](.github/workflows/pages.yml). Pull requests to `main` run tests; pushes to `main` run tests and deploy the app. Manual deployment also runs only on `main`. In GitHub's repository settings, Pages must use **GitHub Actions** as its source, and the `github-pages` environment must permit `main`.

The app can also be served by another static host at a domain root or a repository subpath. Keep the directory structure intact and use a trailing slash in the site URL. The included deployment automation is specific to GitHub; a GitLab copy would need its own deployment configuration.
