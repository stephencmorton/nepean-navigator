# Instructions for coding agents

These instructions apply throughout this repository. Read [README.md](README.md) for the project overview, local setup, and contributor guidance.

## Architecture and constraints

- Keep the app static and dependency-free: plain HTML/CSS/JavaScript ES modules, with no framework or build step. Node.js 22+ is used for tests and CI only; no npm packages need installing.
- Preserve offline use, mobile layouts, keyboard submission, accessible labels, and result/error announcements.
- Preserve the privacy model: no accounts or stored room history. Cache app assets only.
- Keep asset references, module imports, manifest URLs, and service-worker scope relative to the app directory. The same files must work at `/` and `/nepean-navigator/` without a base-URL build setting.

## Map data and routing

- `data.js` is the source of truth for buildings, connections, staircases, stairwell sides, and special destinations. `routing.js` handles parsing, graph construction, and directions; `app.js` handles the interface.
- Room numbers are stored and displayed as four-character strings in floor-building-room order. Accept three-digit entries by prepending `0` on submission and in `parseRoom`; preserve leading zeros for basement floor `0`. Graph nodes use `building-floor` (room `2412` maps to `4-2`).
- `connections` links are automatically bidirectional. Each building's `staircases` list connects every pair of listed floors in one graph edge, not just adjacent floors.
- Breadth-first search minimizes graph edges, not distance or travel time. Validation checks mapped building/floor pairs, not whether an individual room exists. Do not present routes as step-free or fully verified.
- Preserve special arrival/departure instructions for Guidance (`2201`), which is a half-level below the second floor, and the Main building's north/south stairwell guidance.
- School connections are unverified, and the Office room number (`2204`) is provisional. Do not invent missing connections or promote provisional data to confirmed without evidence.

## Offline caching and releases

- Bump `VERSION` in `sw.js` whenever a deployed app asset changes. Documentation-only changes do not require a bump.
- When adding or removing deployed assets, update both the `ASSETS` list in `sw.js` and the staging commands in `.github/workflows/pages.yml` as needed.
- Preserve the worker's request boundaries: only handle known app assets and home navigation within this app. Leave unrelated requests alone.
- Cache names include the app path; cleanup must remove only this app's older caches.
- New workers wait for existing tabs to close so open pages do not mix shell versions. Preserve that update lifecycle.
- Deployment stages an explicit list of app assets. Keep documentation, tests, and development files out of the deployed artifact.

## Verification

Run `node --test` for changes to application code, map data, caching, or deployment. The tests cover parsing, shortest routes, graph symmetry, basement rooms, Guidance, same-floor destinations, missing connections, and caching at both `/` and `/nepean-navigator/` in a simulated worker environment.

For UI or offline changes, also perform relevant browser checks; the simulated worker tests do not establish actual browser installation or offline behaviour:

1. Serve the repository over HTTP using the command in the README. To check a repository subpath, serve its parent directory and visit `http://localhost:8000/nepean-navigator/`.
2. Check routes `2205 → 3341`, `0201 → 0501`, `2205 → 2206`, `2205 → 2201`, and `2412 → 1203`, plus invalid input. Check a narrow mobile viewport and keyboard submission.
3. For offline changes, inspect the manifest and service worker in browser DevTools. Wait for installation online, enable offline mode, reload, and navigate from `2205` to `3341`.
4. For update behaviour, close all app tabs/windows and reopen online. If stale caches obscure local edits, unregister the worker and clear this site's cache. Installation UI varies by browser.

Report which checks were actually performed and any checks that could not be completed. For documentation-only changes, check the diff, links, and consistency with the source; application tests are unnecessary.

## Deployment context

`.github/workflows/pages.yml` runs tests on pull requests to `main` without deploying. Pushes to `main`, and manual dispatch on `main`, test and deploy to GitHub Pages. Local development requires no push or publication. Keep repository edits separate from pushing, merging, or publishing unless the user requests those actions.
