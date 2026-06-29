// End-to-end verification of the REAL plugin-discovery path (no manual remote
// injection). It mocks GET /api.php/home exactly as a Dolibarr server WITH
// capmail installed would answer: menu section + permissions + plugins[] whose
// remoteEntry points at capmail's federated bundle. The PWA must then, on its
// own, discover the plugin, mount /mail, load capmail's remote and render its
// inbox -- reading the host's React + useApi(user/entity) + useViewport.
//
// Build the host with VITE_API_URL=/api.php/ so the home call is interceptable.
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const DIST = "/home/cc/dev/dolipocket/mobile/dist";
// capmail's federated remote, served by the simulated pwa/plugin.php proxy.
const CAPMAIL_DIST = "/home/cc/dev/capmail/integrations/dolipocket/frontend/dist";
const SCREENSHOT = process.env.POC_SCREENSHOT || null;
const MIME = {
  ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".html": "text/html", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json", ".txt": "text/plain",
};

const server = http.createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
    // Simulate pwa/plugin.php: /plugin.php/<id>/<rest> -> capmail dist/<rest>
    // (PATH_INFO style, so relative chunk imports ./assets/* keep resolving).
    if (urlPath.startsWith("/plugin.php/")) {
      const rest = urlPath.replace(/^\/plugin\.php\/[^/]+\//, "");
      const pf = normalize(join(CAPMAIL_DIST, rest));
      if (!pf.startsWith(CAPMAIL_DIST)) { res.writeHead(403); return res.end(); }
      try {
        const pbody = await readFile(pf);
        res.writeHead(200, { "Content-Type": MIME[extname(pf)] || "application/octet-stream" });
        return res.end(pbody);
      } catch { res.writeHead(404); return res.end(); }
    }
    let filePath = normalize(join(DIST, urlPath));
    if (!filePath.startsWith(DIST)) { res.writeHead(403); return res.end(); }
    let st = null;
    try { st = await stat(filePath); } catch { st = null; }
    if (st && st.isDirectory()) { filePath = join(filePath, "index.html"); }
    let body;
    try { body = await readFile(filePath); }
    catch { filePath = join(DIST, "index.html"); body = await readFile(filePath); }
    res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
    res.end(body);
  } catch (e) { res.writeHead(500); res.end(String(e)); }
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;
console.log("static server:", origin);

const browser = await chromium.launch();
const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 960, height: 640 } });

// Seed ONLY the smartcommon global user (localStorage["global"]). That gets
// past PrivatePagesLayout (needs useApi().user) and PostDeviceIdentification
// (passes because there is no auth_user.deviceOptions). No remote URL injected.
await context.addInitScript(() => {
  const user = {
    id: 7, username: "poc-user", entity: 42,
    accessToken: "poc.fake.token", refreshToken: "poc.refresh",
    tokenType: "Bearer", expiresIn: 3600,
    tokenExpiry: Math.floor(Date.now() / 1000) + 3600, rememberMe: true,
  };
  window.localStorage.setItem("global", JSON.stringify({ deviceId: "poc-device-uuid", user }));
});

const page = await context.newPage();
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));

// Mock the Dolibarr API. /home answers like a server WITH capmail installed:
// it advertises the capmail plugin (remoteEntry served same-origin). Everything
// else returns a benign 200 so useApi() keeps the session.
await context.route("**/api.php/**", (route) => {
  const url = route.request().url();
  if (url.includes("/api.php/home")) {
    // Proxy-relative URL, exactly as HomeController::collectPlugins emits it.
    const remoteEntry = "plugin.php/capmail/remoteEntry.js";
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        statusCode: 200,
        menu: [{ title: "Messagerie", items: [{ id: "mail", label: "Mails", icon: "envelope", route: "/mail" }] }],
        permissions: { "mail.read": true, admin: false },
        plugins: [{
          id: "capmail", version: "1.0.0",
          remoteEntry, scope: "capmail_mail", module: "./MailFeature",
          routes: [{ path: "/mail", perm: "mail.read" }],
        }],
      }),
    });
  }
  return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
});

await page.goto(origin + "/#/mail", { waitUntil: "load" });

const result = {};
try {
  await page.waitForSelector('[data-testid="capmail-remote-root"]', { timeout: 20000 });
  result.loaded = true;
  result.inboxRows = await page.$$eval('[data-testid="capmail-inbox"] > li', (els) => els.length);
  result.reactVersion = (await page.textContent('[data-testid="react-version"]'))?.trim();
  result.hostUser = (await page.textContent('[data-testid="host-user"]'))?.trim();
  result.hostEntity = (await page.$('[data-testid="host-entity"]')) ? (await page.textContent('[data-testid="host-entity"]'))?.trim() : null;
  result.hostViewport = (await page.textContent('[data-testid="host-viewport"]'))?.trim();
} catch {
  result.loaded = false;
  result.bodyText = (await page.textContent("body"))?.slice(0, 400);
}

if (SCREENSHOT) {
  await page.screenshot({ path: SCREENSHOT, fullPage: true });
  console.log("screenshot saved:", SCREENSHOT);
}

console.log("--- RESULT ---");
console.log(JSON.stringify(result, null, 2));
if (consoleErrors.length) {
  console.log("--- console errors (first 10) ---");
  console.log(consoleErrors.slice(0, 10).join("\n"));
}

await browser.close();
server.close();

// Proof: discovered from /home (no injection), mounted /mail, loaded capmail's
// remote, rendered its inbox with the host's React + user/entity + viewport.
const ok =
  result.loaded === true &&
  result.inboxRows > 0 &&
  !!result.reactVersion &&
  result.hostUser === "poc-user" &&
  result.hostEntity === "42" &&
  result.hostViewport != null &&
  result.hostViewport !== "?";
console.log("\nVERDICT:", ok ? "PASS" : "FAIL");
process.exit(ok ? 0 : 1);
