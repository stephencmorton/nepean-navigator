# Nepean HS Navigator

This app is aimed at Nepean HS parents, trying to navigate the confusing buildings and room numbers at parent teacher interviews and other occasions. It's a Progressive Web App (PWA) which means you can view it as a web page while you have internet, but you can save it as an app on your phone that works even if you're offline (deep within the halls of Nepean).

Find your way between rooms at Nepean High School. The app gives you directions between buildings and floors, explains room numbers, and includes shortcuts for destinations such as the Library, Guidance, Office, and Gym.

[Open NHS Wayfinder](https://stephencmorton.github.io/nepean-navigator/)

## Understanding room numbering

You don't need actually need this app (!!) if you just understand the way room- and building-numbering works.

<a href="docs/images/room-numbering.png">
  <img src="docs/images/room-numbering.png" alt="Room numbering explained" width="300">
</a>

<a href="docs/images/building-numbering.jpg">
  <img src="docs/images/building-numbering.jpg" alt="Building numbering explained" width="300">
</a>

## Using the app

Enter your starting room, or select entrance **A**, **B**, **C**, or **N** using the letter above the door. Entrances are starting points only; choose **Use a room instead** to switch back. Enter your destination room, then select **Get directions**. Room numbers have four digits: floor, building, and two room digits. You can omit the leading zero for basement rooms: enter `201` or `0201`.

Walking directions provide a numbered sequence to follow. The map shows the whole complex using the supplied floor SVGs, with the relevant floors for buildings along the route and ground-floor drawings for the remaining buildings. Building names come from the drawings themselves. A zigzag break marks a change of displayed floor through a mapped stairwell. At a stairwell, adjacent floor drawings are clipped and overlaid at the landing within one map. If landing coordinates differ, the arriving drawing is aligned to the departing landing. Only genuine route overlaps or missing landing geometry require a continuation below; no floor selector is needed. Compatible floors in one building share a drawing, with dark yellow circles around stairwells used by the route and purple Up/Down labels. Hallway steps remain in the written directions.

Room dots are estimated along manually traced hallway centre lines: numbers increase south to north (left to right on the drawing), or east to west (bottom to top). Named exceptions show an approach point rather than an invented exact room location. Where a hallway is not drawn, such as Main’s basement, that segment is left undrawn and the map refers to the written directions. Zoom and pan to inspect details. The written directions remain the most accurate guide.

![Screenshot](docs/images/route-example.png)

### Offline Use
You do not need an internet connection to use this app (as long as you *already* have it loaded in a browser tab on your phone). But to save it even if you don't have it in a tab, see the section below.

(Useful when you can't get a good internet connection inside NHS.)

### Turning it into a real phone app (iPhone or Android)
You may download the app to your phone, and it will behave just like any other app. In this mode, you can always use use it without an internet connection. Just click the "hamburger menu" in the top right, select "Save app for offlline use", and follow the instructions.

### Limitations

1. Map/Rooms Data
This is a prototype based on my best memory of the buildings. Some connections are missing, and individual room locations have not been verified. Next parent-teacher night I will gather more accurate information.

2. Accessibility
Almost all routes may use stairs. Stair-free access is not mapped.

## Editing the project

The app uses plain HTML, CSS, and JavaScript. There is no framework, build step, or dependency installation.

### Run it locally

With Python 3 installed, run this command from the repository folder:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Visit http://localhost:8000/, edit files, and reload the page. Stop the server with **Ctrl+C** in its terminal. Opening `index.html` directly will not work correctly because JavaScript modules and offline support need HTTP. Production offline support requires HTTPS.

### Where to make changes

| File | Purpose |
| --- | --- |
| [data.js](data.js) | School buildings, floor connections, stairs, and special destinations |
| [route-map.js](route-map.js) and [floor-map.js](floor-map.js) | Composite floor drawings, estimated room positions, traced hallways, and map controls |
| [routing.js](routing.js) | Room parsing, route finding, and written directions |
| [app.js](app.js) | Form behaviour, results, installation help, and service-worker registration |
| [index.html](index.html) and [style.css](style.css) | Page content, structure, and appearance |
| [manifest.webmanifest](manifest.webmanifest) and [icons/](icons/) | App installation details and icons |
| [sw.js](sw.js) | Offline caching and app updates |
| [tests/](tests/) | Automated routing and offline-cache checks |

Named destinations can supply `arrivalStairs` or `departureStairs` objects with `kind: "stairwell"`, `direction`, and a short map `label` for stairs outside the graph, such as Guidance’s half-level. Their written `arrival`/`departure` instructions remain the full description.

`school.entrances` maps door letters to `building`, `floor`, and hallway `side`, with an optional `staircase` label. `floor` is the hallway level reached after entering; optional `doorFloor` records a different physical door level. C and N are ground-level doors whose hallway stairs lead to floor 2, so routing starts at floor 2 and the instructions explain the approach. Stairwell sides come from the existing staircase metadata. Entrance positions guide the instructions; they do not add graph edges or exact hallway geometry.

Building descriptions contain `name`, `highRoom` (the highest two-digit room suffix), `lowestFloor`, and `highestFloor`, with inclusive limits. Input validation accepts suffixes from 01 through `highRoom` and floors within that building’s range, and still requires a mapped building/floor node. These bounds do not verify individual rooms or create missing connections. Building 5 uses floor 1, including the Gym preset `1509`. Tests check that connections, staircases, and named destinations stay within building descriptions.

For map edits, room numbers use **floor-building-room digits**, while connection keys use **building-floor**. For example, room `2412` belongs to node `4-2`. Each building’s `staircases` object is keyed by staircase label, for example `J: {side: "west", floors: [0, 1, 2]}`. Each staircase connects every pair of its listed floors. Use `kind: "hallway"` for hallway steps that should not receive a stairwell badge. Directions show the label and hallway end; when no side is known, they list the staircases serving both floors. Connections are a list of `{from, to}` objects using graph node IDs, with optional `stairs: {direction: "down", extent: "half-flight"}` metadata. Direction describes travel from `from` to `to`; reverse travel swaps `up` and `down`. Use `direction: "unknown"` when stairs are known but their direction is not. Omit `stairs` when no stair instruction is mapped; this does not establish step-free access. Connections are automatically bidirectional and remain one graph edge regardless of connecting stairs. Check school-map corrections against the actual building before treating them as confirmed.

The active floor-map display geometry lives in `floor-map.js`, using a 773 × 742 coordinate canvas aligned with `public/floor-0.svg` through `public/floor-3.svg`. Hallway centre lines, branch junctions, staircase landings, entrance points, building ports, and clipping bounds are explicit. Rectangle overlaps in the artwork do not create connections. Room interpolation follows path length, not a straight line through bends. The per-building room limit currently applies on every floor.

Keep SVG canvas dimensions and alignment stable when refining the artwork. Register new geometry explicitly, and cache/stage any new deployed assets. The older `mapLayout` schematic in `data.js` and its helper functions remain as reference geometry; they do not drive the new floor drawings. Routing still comes only from `school.connections` and `school.staircases`.

A route may use any equally valid nearest stairwell when the written directions offer a choice; the display selects the closest allowed option along the traced hall from the estimated entry point. Special arrivals and departures remain in the written directions. The images are approximate, and the composite does not establish step-free access or verified individual room locations.

### Check your changes

With Node.js 22 or newer installed, run:

```sh
node --test
```

Also try your changes in a browser, including a narrow mobile view and keyboard navigation. For changes to offline behaviour, let the app install online, switch the browser to offline mode, reload, and request a route.

When changing any deployed app asset, bump `VERSION` in `sw.js` so returning users receive the update. Documentation-only changes do not need a version bump. New versions wait for existing app tabs to close; close all app tabs/windows and reopen online to update. If cached files hide local edits, unregister the service worker and clear this site's cache in browser DevTools.

### Publishing

The repository includes a [GitHub Pages workflow](.github/workflows/pages.yml). Pull requests to `main` run tests; pushes to `main` run tests and deploy the app. Manual deployment also runs only on `main`. In GitHub's repository settings, Pages must use **GitHub Actions** as its source, and the `github-pages` environment must permit `main`.

The app can also be served by another static host at a domain root or a repository subpath. Keep the directory structure intact and use a trailing slash in the site URL. The included deployment automation is specific to GitHub; a GitLab copy would need its own deployment configuration.

Coding agents should also read [AGENTS.md](AGENTS.md) for implementation constraints and detailed verification steps.
