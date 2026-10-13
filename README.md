# Nepean HS Navigator

This app is aimed at Nepean HS parents, trying to navigate the confusing buildings and room numbers at parent teacher interviews and other occasions. It's a Progressive Web App (PWA) which means you can view it as a web page while you have internet, but you can save it as an app on your phone that works even if you're offline (deep within the halls of Nepean).

Find your way between rooms at Nepean High School. The app gives you directions between buildings and floors, explains room numbers, and includes shortcuts for destinations such as the Library, Guidance, Office, and Gym.

[Open NHS Wayfinder](https://stephencmorton.github.io/nepean-navigator/)

## Using the app

Enter your starting room and destination, then select **Get directions**. Room numbers have four digits: floor, building, and two room digits. Include the leading zero for basement rooms, such as `0501`.

After an online visit has finished downloading the app for offline use, you can use it without an internet connection. You can also add it to your phone's Home Screen using the instructions in the app. No account is needed, and the app does not store your room history; only app assets are cached.

This is a prototype based on an unverified school map supplied by a parent. Some connections are missing, and individual room locations have not been verified. Routes may use stairs; step-free access is not mapped. Routes favour fewer building/floor connections, which may not mean the shortest walk.

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
| [routing.js](routing.js) | Room parsing, route finding, and written directions |
| [app.js](app.js) | Form behaviour, results, installation help, and service-worker registration |
| [index.html](index.html) and [style.css](style.css) | Page content, structure, and appearance |
| [manifest.webmanifest](manifest.webmanifest) and [icons/](icons/) | App installation details and icons |
| [sw.js](sw.js) | Offline caching and app updates |
| [tests/](tests/) | Automated routing and offline-cache checks |

For map edits, room numbers use **floor-building-room digits**, while connection keys use **building-floor**. For example, room `2412` belongs to node `4-2`. Connections are automatically bidirectional. Check school-map corrections against the actual building before treating them as confirmed.

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
