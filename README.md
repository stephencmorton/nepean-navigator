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

Tests cover parsing, shortest routes, graph symmetry, ground-floor rooms, guidance, same-floor destinations, missing connections, and service-worker caching at both `/` and `/nepean-navigator/` using a simulated worker environment.

For a local repository-subpath check, serve the parent folder:

```sh
cd ..
python3 -m http.server 8000 --bind 127.0.0.1
```

Visit http://localhost:8000/nepean-navigator/. In browser DevTools, inspect Application → Manifest and Service Workers. Wait for “Ready for offline use”, turn on Network → Offline, reload, and navigate from 2205 to 3341. Test invalid input, 0201 → 1501, 2205 → 2206, 2205 → 2201, and disconnected 1401 → 2205. Test a narrow mobile viewport and keyboard submission. Installation UI varies by browser; on iOS use Add to Home Screen.

## School map and routing

`data.js` holds building names, staircases, inter-building links, and guidance instructions. `routing.js` handles room parsing, bidirectional graph construction, breadth-first shortest-path search, and text instructions. `app.js` renders text safely and registers the worker.

Room numbers encode floor, building, then two room digits. This is not a room inventory: valid mapped building/floor pairs do not guarantee a room exists. The original topology is retained, including its missing connections. Math/Science has stairs but no link to the other buildings. Main building split levels remain simplified; guidance 2201 has explicit half-level instructions. Accessible/step-free routes are not mapped. Verify the topology with the school before relying on it.

Different rooms on the same floor now receive walking directions; only the identical room reports arrival. Stair directions name the target floor without incorrectly describing a multi-floor climb as one level.

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
