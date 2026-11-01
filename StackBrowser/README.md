# StackBrowser

A desktop-style web browser whose **Back / Forward history is a C++ two-stacks-in-one-array**.
Everything runs locally on your computer. Internet access is only needed to load real websites.

```
index:   0                                         N-1
        [ b0 b1 b2 .  .  .  .  .  .  .  f2 f1 f0 ]
          Back stack grows ->        <- Forward stack grows
```

## What you need (Windows)

| Tool | Why | Get it |
| --- | --- | --- |
| Node.js 18 or newer | runs the local server and UI | https://nodejs.org |
| A C++17 compiler | builds the history engine | **MinGW-w64 / MSYS2** (`g++`) https://www.msys2.org, or Visual Studio Build Tools (`cl`) |

No `npm install` is needed: the project has no npm dependencies.

## Run it

Open the `StackBrowser` folder in File Explorer and double-click **`start.bat`**.
It builds the C++ engine the first time, starts the server and opens http://localhost:3000.

Or from a terminal (PowerShell or Command Prompt):

```bat
cd path\to\StackBrowser
build.bat          :: compiles engine\bin\history_engine.exe (once, or after editing engine\*.cpp/*.hpp)
node server\server.js
```

Then open http://localhost:3000. Press `Ctrl+C` in the terminal to stop.

Using MSYS2? Install the compiler once with `pacman -S mingw-w64-ucrt-x86_64-gcc`, add
`C:\msys64\ucrt64\bin` to your `PATH`, then open a new terminal.
For Visual Studio Build Tools, run `build.bat` from the **x64 Native Tools Command Prompt**.

Options (environment variables): `PORT` (default 3000), `STACKBROWSER_CAPACITY` (array size, 4-256, default 16).

```bat
set PORT=4000 && node server\server.js
```

Linux / macOS: `make -C engine && node server/server.js`.

## Using the browser

- Type an address or a search into the address bar or the start page. Searches use DuckDuckGo.
- Click links inside pages, use **Back** and **Forward** (`Alt+Left`, `Alt+Right`), **Reload**, **Home** (`Alt+Home`).
- Back and Forward are greyed out when their stack is empty.
- Tabs: `+` opens a tab, `x` (or middle-click) closes one. Every tab has its own history array.
- Star icon bookmarks a page (stored in this browser's local storage); the bookmarks bar appears once you have one.
- The **`</>` button** (or the status bar, or the settings menu) opens the **History inspector**:
  the shared array as indexed cells, the Back stack growing from the left, the Forward stack
  from the right, `backTop` / `forwardTop` pointers, the current URL and a live operation log
  with push/pop animations. It is collapsed by default and always shows the engine's real state.
- Settings menu (three dots): toggle the inspector, toggle the bookmarks bar, clear this tab's
  Back/Forward history, remove all bookmarks.

When the array is completely full the oldest Back entry is evicted (shown in the log).

## How it fits together

```
engine/history.hpp   TwoStackHistory: the two-stacks-in-one-array algorithm
engine/main.cpp      line protocol (NEW / VISIT / BACK / FORWARD / STATE / RESET / CLOSE) -> JSON
server/engine.js     starts history_engine.exe and queues commands
server/server.js     local HTTP server: UI, /api/tabs/..., /proxy
server/proxy.js      fetches pages server-side so sites that forbid framing still display
public/              the browser UI (HTML, CSS, ES modules; no build step)
test/run-tests.js    engine + API + proxy tests   (run: node test/run-tests.js)
```

The browser's own `history` object is never used. Every navigation, Back and Forward is a
command to the C++ engine, and the UI renders whatever state the engine returns.

## Honest limits

- Pages are shown through a local proxy inside a sandboxed frame. Simple and content sites
  (Wikipedia, Hacker News, MDN, DuckDuckGo) work well. Sites that rely heavily on logins,
  cookies, local storage or anti-bot checks (many social and shopping sites, some GitHub pages)
  may render partially or show a challenge page. Cookies are not carried between visits.
- The proxy refuses private/local network addresses on purpose, and the server only listens on `127.0.0.1`.
- Links and plain (GET) forms are routed through the history; JavaScript-driven navigation
  inside a page is not.
- Inter loads from Google Fonts when online; offline it falls back to Segoe UI.
