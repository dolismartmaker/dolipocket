# Dolipocket

> "Dolibarr in your pocket" - a multi-tenant SaaS built on top of
> [Dolibarr ERP/CRM](https://www.dolibarr.org), designed to be used 100% from a
> smartphone, with a growing desktop mode that aims at full Dolibarr parity.

Dolipocket is packaged as a standard Dolibarr external module (`type:
dolibarr-module`). It turns a single Dolibarr instance into a SaaS where every
sign-up provisions an isolated tenant, and exposes the whole working session
through a modern React PWA talking to a JWT-secured API.

- **Status**: active development, version `1.0.0`.
- **License**: GPL-3.0-or-later (see `COPYING`).
- **Requires**: PHP >= 7.4 (dev runs on 8.2), Dolibarr >= 11.

![Dolipocket screenshot](img/screenshot_dolipocket.png "Dolipocket")

> A French version of this README is available: [README-fr.md](README-fr.md).

---

## 1. Concept

Each sign-up creates a brand new Dolibarr `entity`. Tenants are isolated by
Dolibarr's native `WHERE entity = N` filtering (the engine already applies it
everywhere through `$conf->entity`).

We deliberately do **not** use the official Multicompany module: Multicompany
exists to *share* data between entities, and sharing is exactly what we want to
avoid. One Dolibarr install, one database, strict isolation per entity.

- `entity = 0` is reserved for Dolibarr global constants.
- `entity = 1` is reserved for the SaaS operator itself (never a client tenant).
- Each client tenant gets `entity = N` (MAX existing + 1).

The login is the email, and it is unique across all entities within Dolipocket.

---

## 2. Hybrid architecture

Two front-ends coexist and are bridged after login:

### 2.1 Public Blade site (`public/`, `src/Web/`, `resources/views/`)
Server-rendered PHP/Blade (via `eftec/bladeone`) for SEO and simplicity:
- Landing, pricing, legal, terms
- Sign-up with email OTP
- Login, forgot-password, reset

No build step - it is plain PHP/Blade.

### 2.2 Authenticated PWA (`mobile/`)
A React 19 + Vite single-page app (generated and kept aligned with SmartBoot /
SmartMaker) that hosts the entire work session: the full commercial cycle plus
catalog, stock, agenda and document management. It talks to the API with a JWT
Bearer token and caches with Dexie (IndexedDB).

### 2.3 The bridge
After a successful Blade login, `AuthController::loginSubmit()` mints a SmartAuth
token pair via
`\SmartAuth\Api\AuthController::generateTokenForAuthenticatedUser(...)` and
redirects to `<PWA_URL>/#/handoff?...`. The React `HandoffPage` reads the tokens
(and the server-generated `device_uuid`) from the URL fragment, writes them
directly into `localStorage["global"]` (the key SmartAuth's `useGlobalStates`
expects), then does a hard reload onto `/`.

---

## 3. Tech stack

| Layer | Tech |
|---|---|
| Module host | Dolibarr (external module under `custom/dolipocket`) |
| Public site | PHP + BladeOne templates |
| API | PHP controllers under `Dolipocket\Api\`, routed by SmartAuth `RouteCache` |
| Auth | SmartAuth (JWT access + refresh, per-entity signing key) |
| Mappers | smartauth `dmBase`/`dmTrait` (introspect Dolibarr `$fields` + extrafields) |
| PWA | React 19, Vite 6, `@cap-rel/smartcommon`, Dexie, vite-plugin-pwa |
| Static analysis | PHPStan (Dolibarr stubs), oxlint + eslint for JS |
| Tests | PHPUnit (unit / integration-sqlite / HTTP), Playwright (E2E) |

The PWA depends on internal packages linked via `file:` (`@cap-rel/smartcommon`,
sometimes `@cap-rel/smartauth`). These resolve through their built `dist/`, not
`src/` - if you edit a linked package's source, rebuild it (`npm run build` in
that package) before debugging, otherwise the consumer keeps loading a stale
bundle.

---

## 4. Repository layout

```
dolipocket/
├── core/modules/modDolipocket.class.php   # Dolibarr module descriptor
├── class/actions_dolipocket.class.php     # POST/PUT validation schemas (anti 255-char truncation)
├── admin/                                 # setup / about / smartmaker admin pages
├── lib/dolipocket.lib.php                 # Blade helpers + user lookup
├── public/                                # Public Blade site (front controller + headers)
├── src/
│   ├── Web/                               # Blade controllers (Home, Auth, Route, Base)
│   └── Tenant/                            # EntityProvisioner + EntityResolver
├── resources/views/                       # Blade templates (FR, with accents)
├── pwa/api.php                            # API router (SmartAuth) + CORS block
├── smartmaker-api/                        # API controllers + mappers (namespace Dolipocket\Api)
│   ├── Trait/                             # PaginatedListTrait, dmCatalogTrait, DocumentContactTrait, ...
│   └── *Controller.php + dm*.php          # one controller + one mapper per feature
├── smartmaker-api-prepend.php             # Bootstrap: Dolibarr + autoload + JWT key per entity
├── mobile/                                # React PWA
│   ├── src/api/mapping/<feature>.js       # pure mappers (mapFromBackend / mapToBackend)
│   ├── src/db/                            # single Dexie instance + per-feature stores/hooks
│   ├── src/components/pages/private/      # feature pages (split mobile/desktop)
│   ├── src/lib/datatable/                 # generic DataTable + document detail components
│   ├── src/lib/forms/                     # AutoForm (form-from-catalog) + FkPicker
│   └── src/lib/permissions/               # useMenu + RequirePermission + iconMap
├── sql/                                   # tenant table + schema
├── scripts/provision.php                  # CLI provisioning
├── test/                                  # phpunit/{unit,integration-dolibarr,http} + mobile (Playwright)
├── langs/{fr_FR,en_US}/dolipocket.lang    # translations (FR keeps accents)
└── docs/                                  # user docs + HANDOFF.md + specs
```

---

## 5. How multi-tenant provisioning works

1. Visitor submits email + company name on `/signup`. A row is inserted into
   `llx_dolipocket_tenant` with `status = 'pending_otp'`.
2. A 6-digit OTP is emailed (15-minute TTL).
3. Visitor enters the OTP + a password.
4. `Dolipocket\Tenant\EntityProvisioner::provision()`:
   - allocates a new `entity` value (MAX existing + 1, never 1),
   - inserts minimal constants into `llx_const` (company name, language,
     currency, numbering addons, enabled modules),
   - creates the admin user (`llx_user.entity = N`, login = email),
   - creates `documents/N/` with its subfolders.
5. The tenant flips to `status = 'active'` with its `entity` and admin user id.

---

## 6. Key conventions (read before contributing code)

These are enforced; PRs that break them will be sent back.

### Backend (PHP)
- Controllers live in `Dolipocket\Api\` (mapped to `smartmaker-api/`). Run
  `composer dump-autoload` after adding one.
- Controllers return `array($data, $httpCode)`.
- **Tenant isolation uses `getEntity('xxx')` everywhere** - never a hardcoded
  `WHERE entity = N`.
- Permissions go through `$user->hasRight(...)`.
- Mappers use `$mapper->exportMappedData($obj)`. For line-based documents,
  call `$obj->fetch_lines()` first.
- **Every error branch logs via `dol_syslog` (prefix `DPK`) BEFORE returning.**
  No silent failures.
- **Every new POST/PUT route needs a validation schema** in
  `class/actions_dolipocket.class.php::smartmaker_addValidationSchemas()`.
  Without it, POSTed strings are silently truncated to 255 chars. `filter` is
  typed `raw` (not `array`), `note_*`/`description` typed `TYPE_RAW`.
- Use `dol_include_once('/dolipocket/...')`, never `require_once '../...'`.

### Naming (important and easy to get wrong)
- **HTTP API endpoints are SINGULAR**: `thirdparty`, `contact`, `proposal`,
  `supplierorder`.
- **React Router URLs are PLURAL**: `/thirdparties`, `/contacts`, `/proposals`,
  `/supplier-orders`.

### Frontend (React PWA)
- **All CRUD goes through `useDb<Feature>()` hooks** - feature pages never call
  `useApi()` directly (only `HomePage` and `DeviceIdentificationPage` are
  legitimately exempt).
- Mappers are pure: `mapFromBackend` / `mapToBackend`, no HTTP, no Dexie.
- Front-end fields are **camelCase**; snake_case conversion happens in the
  mapper.
- Pages use the **split pattern** when relevant: `index.jsx` (viewport router)
  + `useXxxData.js` (data hook) + `Xxx.mobile.jsx` + `Xxx.desktop.jsx`.
  Mobile is kept lean; the desktop side carries the richer features.
- i18n is per-namespace (`useTranslation('<feature>')`).
- Single smartcommon `<Provider>` - do not stack providers or add a second
  `<Toaster>`.

### Desktop UI rules (lean style)
No `shadow-sm`/`shadow-md` on cards (only floating overlays get `shadow-lg`),
no `rounded-2xl`/`rounded-3xl`, no nested cards, tight density (`p-3`/`p-4`
max), borders (not shadows) to separate, discreet hover (no `hover:shadow-md`,
no `transition-all`), no gradients on cards/KPIs, no `active:` on desktop. Full
rationale in `.claude/CLAUDE.md`.

### The "single source of truth" pattern
The big architectural bet: the **mapper's published field list is the only
place a field is declared**. The frontend reads server-generated catalogs
(`<feature>/columns`, `<feature>/lines/columns`, `<feature>/describe`) to drive
DataTable columns, document detail blocks and edit forms (`<AutoForm>`).

Practical upside: to expose a new Dolibarr field (or extrafield) in a list,
detail page or form, you add **one line** to the mapper's
`$listOfPublishedFields` - no frontend edit required.

---

## 7. Getting started (development)

This is a dev/analysis machine: apps are not meant to run as persistent servers
here. Builds, static analysis and the (ephemeral) automated test suites are the
supported workflows.

### Install
```sh
# PHP side
composer install

# PWA side
cd mobile && npm install
```

### Build the PWA
```sh
cd mobile && npm run build      # Vite + vite-plugin-pwa -> dist/ + service worker
```

### Static analysis
```sh
DOLIBARR_VERSION=18 make phpstan         # uses Dolibarr stubs
cd mobile && npm run lint                # oxlint first, then eslint for the rest
```

### Tests
```sh
composer test:unit          # PHPUnit unit
composer test:integration   # PHPUnit integration (cap-rel/dolibarr-integration-sqlite, ~5 min bootstrap)
composer test:http          # PHPUnit HTTP (spawns an internal php -S)
cd test/mobile && npx playwright test    # E2E (spawns php -S + vite preview)
```

Known acceptable PHPStan noise: 2 pre-existing errors in `VCardHelper`. Do not
add new ones.

### CLI provisioning (handy for local testing)
```sh
php scripts/provision.php email@example.com "Company name" password
```

---

## 8. Roadmap and where to help

The current campaign is **"desktop = Dolibarr parity"**: progressively expose
all Dolibarr features in desktop mode (the 93 core modules), while keeping the
mobile UI lean (essential commercial cycle only). Work proceeds **lot by lot** -
one object/module delivered end to end (backend + desktop + tests + commit).

Already delivered (12 core entities + the commercial-parity lots):
- Third parties, contacts, products, warehouses, stock, proposals, orders,
  invoices, supplier orders/invoices, agenda, document management.
- Generic desktop `<DataTable>` (pagination, Dolibarr-style filters, sorting,
  CSV/XLS/ODS export, catalog-driven columns).
- Catalog-driven document detail and `<AutoForm>` edit forms.
- Server-computed menu + per-feature permissions.
- Parity Tier A so far: shipments, supplier receptions, supplier price
  requests, product price writing, deposit/recurring invoices, reusable
  discounts, product variants.

Good places to start contributing (details in `docs/HANDOFF.md` sections 3-4):
- Refactor the remaining edit pages and simple detail pages to the split
  pattern with `<AutoForm>` / `<DocumentHeaderFields>`.
- Add the missing integration tests for the 7 Tier-1 features.
- Investigate the known `ThirdPartyListTest` sort-desc regression.

---

## 9. Documentation for contributors

Read these before touching the corresponding area:

- `docs/HANDOFF.md` - executive summary, delivered work, remaining work, known
  bugs, strict conventions. **Start here** if you join the project.
- `.claude/CLAUDE.md` - dense module briefing (concept, conventions, full
  delivery log, lean desktop UI rules).
- `docs/DATATABLE_SPEC.md` - the desktop list/datatable spec.
- `prompt.md` - the autonomous brief for the Dolibarr-parity campaign.
- `docs/users/` - end-user documentation (French, YAML front matter).

---

## 10. Licenses

Main code is GPLv3 or (at your option) any later version - see `COPYING`.
Documentation and readmes are licensed under GFDL.
