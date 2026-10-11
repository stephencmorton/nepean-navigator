# Nepean HS Navigator

A static, dependency-free HTML/CSS/JavaScript PWA. No framework, build step, accounts, or stored room history. Only app assets are cached for offline use.

## Local development

Open this folder in VS Code. With Python 3 installed, run from the repository root:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Visit http://localhost:8000/. Edit files and reload. ES modules and service workers need HTTP: do not open `index.html` as a file. Offline support requires HTTPS in production or localhost during development.

Node.js 22+ is used only for tests; there are no npm packages to install:

```sh
node --test
```

Tests cover parsing, shortest routes, graph symmetry, rooms on the basement (floor 0), guidance, same-floor destinations, missing connections, and service-worker caching at both `/` and `/nepean-navigator/` using a simulated worker environment.

For a local repository-subpath check, serve the parent folder:

```sh
cd ..
python3 -m http.server 8000 --bind 127.0.0.1
```

Visit http://localhost:8000/nepean-navigator/. In browser DevTools, inspect Application → Manifest and Service Workers. Wait for the service worker to finish installing, turn on Network → Offline, reload, and navigate from 2205 to 3341. Test invalid input, 0201 → 0501, 2205 → 2206, 2205 → 2201, and 2412 → 1203. Test a narrow mobile viewport and keyboard submission. Installation UI varies by browser; on iOS use Add to Home Screen.

## School map and routing

`data.js` is the source of truth for school map data and special destinations. `routing.js` parses rooms, builds the bidirectional graph, and generates directions using breadth-first search. `app.js` handles the interface and worker registration.

Room numbers use **floor-building-room digits**; graph nodes use **building-floor**. `connections` lists links between nodes (each link is automatically bidirectional), and `staircases` lists connected floors by building. `knownRooms` holds destination names and any special arrival/departure instructions.

Routes minimize graph edges, not walking distance or travel time. Map coverage validates building/floor pairs, not the existence of individual rooms. Accessible routes are not modeled.

## Offline updates

`sw.js` precaches the complete app shell. All paths are relative to the worker directory, so the app works under a repository subpath or a custom-domain root. It handles only known app assets and home navigation; it leaves unrelated sites and requests alone. Cache names include the app path, and cleanup removes only this app's older caches.

Bump `VERSION` in `sw.js` whenever changing any deployed asset. New workers wait for existing tabs to close so an open page does not mix shell versions. Close all app tabs/windows and reopen online to apply updates. During development, DevTools → Application → Service Workers → Unregister and clear this site's cache if stale files obscure changes. Offline use requires at least one successful online visit and worker installation.

## GitHub Pages deployment

No push or publication is needed for local development. After reviewing and approving the change:

1. Push the feature branch and open a PR. PRs run tests without deploying.
2. In GitHub Settings → Pages, select **GitHub Actions** as the source. Check the `github-pages` environment permits main.
3. Merge the approved PR to main. `.github/workflows/pages.yml` runs tests, stages only app assets, uploads the Pages artifact, and deploys it. Manual dispatch also deploys only when run on main.
4. Check the Actions deployment result and test https://stephencmorton.github.io/nepean-navigator/, including the offline browser checks above.

There is no base URL build setting: HTML references, module imports, manifest start URL/scope, and service-worker scope resolve under the app directory. Use the trailing slash in the site URL. Node is only a CI test tool. The old Azure and package-based deployment workflows have been removed from this branch.

References: [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [MDN service workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers).
