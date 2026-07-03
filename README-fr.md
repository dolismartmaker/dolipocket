# Dolipocket

> "Dolibarr dans votre poche" - un SaaS multi-tenant bâti sur
> [Dolibarr ERP/CRM](https://www.dolibarr.org), pensé pour s'utiliser 100% depuis
> un smartphone, avec un mode bureau en croissance qui vise la parité complète
> avec Dolibarr.

Dolipocket est livré comme un module externe Dolibarr standard (`type:
dolibarr-module`). Il transforme une instance Dolibarr unique en SaaS où chaque
inscription provisionne un tenant isolé, et expose toute la session de travail
via une PWA React moderne dialoguant avec une API sécurisée par JWT.

- **Statut** : développement actif, version `1.0.0`.
- **Licence** : GPL-3.0-or-later (voir `COPYING`).
- **Prérequis** : PHP >= 7.4 (le dev tourne sur 8.2), Dolibarr >= 11.

![Capture Dolipocket](img/screenshot_dolipocket.png "Dolipocket")

> An English version of this README is available: [README.md](README.md).

---

## 1. Concept

Chaque inscription crée une nouvelle `entity` Dolibarr. Les tenants sont isolés
par le filtrage natif `WHERE entity = N` de Dolibarr (le moteur l'applique déjà
partout via `$conf->entity`).

Nous n'utilisons volontairement **pas** le module officiel Multicompany :
Multicompany existe pour *partager* des données entre entités, et le partage est
précisément ce que nous voulons éviter. Une seule installation Dolibarr, une
seule base, isolation stricte par entity.

- `entity = 0` est réservée aux constantes globales de Dolibarr.
- `entity = 1` est réservée à l'opérateur SaaS lui-même (jamais un tenant client).
- Chaque tenant client reçoit `entity = N` (MAX existant + 1).

Le login est l'email, et il est unique parmi toutes les entités au sein de
Dolipocket.

---

## 2. Architecture hybride

Deux fronts coexistent et sont reliés après le login :

### 2.1 Site public Blade (`public/`, `src/Web/`, `resources/views/`)
PHP/Blade rendu côté serveur (via `eftec/bladeone`), pour le SEO et la
simplicité :
- Landing, tarifs, mentions légales, CGU
- Inscription avec OTP par email
- Login, mot de passe oublié, réinitialisation

Pas d'étape de build - c'est du PHP/Blade pur.

### 2.2 PWA authentifiée (`mobile/`)
Une application monopage React 19 + Vite (générée et maintenue alignée avec
SmartBoot / SmartMaker) qui héberge toute la session de travail : le cycle
commercial complet plus le catalogue, le stock, l'agenda et la gestion
documentaire. Elle dialogue avec l'API via un jeton JWT Bearer et met en cache
avec Dexie (IndexedDB).

### 2.3 Le pont
Après un login Blade réussi, `AuthController::loginSubmit()` génère une paire de
jetons SmartAuth via
`\SmartAuth\Api\AuthController::generateTokenForAuthenticatedUser(...)` puis
redirige vers `<PWA_URL>/#/handoff?...`. Le `HandoffPage` React lit les jetons
(et le `device_uuid` généré côté serveur) depuis le fragment d'URL, les écrit
directement dans `localStorage["global"]` (la clé attendue par le
`useGlobalStates` de SmartAuth), puis effectue un rechargement complet sur `/`.

---

## 3. Pile technique

| Couche | Technologie |
|---|---|
| Hôte du module | Dolibarr (module externe sous `custom/dolipocket`) |
| Site public | PHP + templates BladeOne |
| API | Contrôleurs PHP sous `Dolipocket\Api\`, routés par le `RouteCache` SmartAuth |
| Authentification | SmartAuth (JWT access + refresh, clé de signature par entity) |
| Mappers | `dmBase`/`dmTrait` de smartauth (introspection des `$fields` Dolibarr + extrafields) |
| PWA | React 19, Vite 6, `@cap-rel/smartcommon`, Dexie, vite-plugin-pwa |
| Analyse statique | PHPStan (stubs Dolibarr), oxlint + eslint pour le JS |
| Tests | PHPUnit (unit / integration-sqlite / HTTP), Playwright (E2E) |

La PWA dépend de packages internes liés via `file:` (`@cap-rel/smartcommon`,
parfois `@cap-rel/smartauth`). Ils se résolvent via leur `dist/` compilé, pas via
`src/` - si vous modifiez les sources d'un package lié, rebuildez-le
(`npm run build` dans ce package) avant de déboguer, sinon le consommateur
continue de charger un bundle obsolète.

---

## 4. Structure du dépôt

```
dolipocket/
├── core/modules/modDolipocket.class.php   # Descripteur du module Dolibarr
├── class/actions_dolipocket.class.php     # Schémas de validation POST/PUT (anti-troncature 255)
├── admin/                                 # Pages admin setup / about / smartmaker
├── lib/dolipocket.lib.php                 # Helpers Blade + lookup utilisateur
├── public/                                # Site public Blade (front controller + headers)
├── src/
│   ├── Web/                               # Contrôleurs Blade (Home, Auth, Route, Base)
│   └── Tenant/                            # EntityProvisioner + EntityResolver
├── resources/views/                       # Templates Blade (FR, avec accents)
├── pwa/api.php                            # Routeur API (SmartAuth) + bloc CORS
├── smartmaker-api/                        # Contrôleurs API + mappers (namespace Dolipocket\Api)
│   ├── Trait/                             # PaginatedListTrait, dmCatalogTrait, DocumentContactTrait, ...
│   └── *Controller.php + dm*.php          # un contrôleur + un mapper par feature
├── smartmaker-api-prepend.php             # Bootstrap : Dolibarr + autoload + clé JWT par entity
├── mobile/                                # PWA React
│   ├── src/api/mapping/<feature>.js       # mappers purs (mapFromBackend / mapToBackend)
│   ├── src/db/                            # instance Dexie unique + stores/hooks par feature
│   ├── src/components/pages/private/      # pages métier (split mobile/desktop)
│   ├── src/lib/datatable/                 # DataTable générique + composants de fiche détail
│   ├── src/lib/forms/                     # AutoForm (formulaire depuis catalogue) + FkPicker
│   └── src/lib/permissions/               # useMenu + RequirePermission + iconMap
├── sql/                                   # table tenant + schéma
├── scripts/provision.php                  # Provisioning en ligne de commande
├── test/                                  # phpunit/{unit,integration-dolibarr,http} + mobile (Playwright)
├── langs/{fr_FR,en_US}/dolipocket.lang    # traductions (le FR garde les accents)
└── docs/                                  # doc utilisateur + HANDOFF.md + specs
```

---

## 5. Fonctionnement du provisioning multi-tenant

1. Le visiteur saisit email + nom de société sur `/signup`. Une ligne est insérée
   dans `llx_dolipocket_tenant` avec `status = 'pending_otp'`.
2. Un OTP à 6 chiffres est envoyé par email (TTL 15 minutes).
3. Le visiteur saisit l'OTP + un mot de passe.
4. `Dolipocket\Tenant\EntityProvisioner::provision()` :
   - alloue une nouvelle valeur `entity` (MAX existant + 1, jamais 1),
   - insère les constantes minimales dans `llx_const` (nom de société, langue,
     devise, addons de numérotation, modules activés),
   - crée l'utilisateur admin (`llx_user.entity = N`, login = email),
   - crée `documents/N/` avec ses sous-dossiers.
5. Le tenant bascule en `status = 'active'` avec son `entity` et l'identifiant de
   l'utilisateur admin.

---

## 6. Conventions clés (à lire avant de contribuer au code)

Elles sont appliquées strictement ; les PR qui les enfreignent seront renvoyées.

### Backend (PHP)
- Les contrôleurs vivent dans `Dolipocket\Api\` (mappé vers `smartmaker-api/`).
  Lancez `composer dump-autoload` après en avoir ajouté un.
- Les contrôleurs retournent `array($data, $httpCode)`.
- **L'isolation tenant utilise `getEntity('xxx')` partout** - jamais un
  `WHERE entity = N` codé en dur.
- Les permissions passent par `$user->hasRight(...)`.
- Les mappers utilisent `$mapper->exportMappedData($obj)`. Pour les documents à
  lignes, appelez d'abord `$obj->fetch_lines()`.
- **Toute branche d'erreur logge via `dol_syslog` (préfixe `DPK`) AVANT le
  retour.** Aucun échec silencieux.
- **Toute nouvelle route POST/PUT nécessite un schéma de validation** dans
  `class/actions_dolipocket.class.php::smartmaker_addValidationSchemas()`. Sans
  lui, les chaînes POST sont tronquées silencieusement à 255 caractères.
  `filter` est typé `raw` (pas `array`), `note_*`/`description` typés `TYPE_RAW`.
- Utilisez `dol_include_once('/dolipocket/...')`, jamais `require_once '../...'`.

### Nommage (important et facile à se tromper)
- **Les endpoints HTTP de l'API sont au SINGULIER** : `thirdparty`, `contact`,
  `proposal`, `supplierorder`.
- **Les URLs React Router sont au PLURIEL** : `/thirdparties`, `/contacts`,
  `/proposals`, `/supplier-orders`.

### Frontend (PWA React)
- **Tout le CRUD passe par les hooks `useDb<Feature>()`** - les pages métier
  n'appellent jamais `useApi()` directement (seuls `HomePage` et
  `DeviceIdentificationPage` y dérogent légitimement).
- Les mappers sont purs : `mapFromBackend` / `mapToBackend`, pas d'HTTP, pas de
  Dexie.
- Les champs front sont en **camelCase** ; la conversion en snake_case se fait
  dans le mapper.
- Les pages utilisent le **pattern split** quand c'est pertinent : `index.jsx`
  (routeur viewport) + `useXxxData.js` (hook de données) + `Xxx.mobile.jsx` +
  `Xxx.desktop.jsx`. Le mobile reste épuré ; le côté desktop porte les
  fonctionnalités les plus riches.
- L'i18n est par namespace (`useTranslation('<feature>')`).
- Un seul `<Provider>` smartcommon - ne pas empiler les providers ni ajouter un
  second `<Toaster>`.

### Règles UI desktop (style épuré)
Pas de `shadow-sm`/`shadow-md` sur les cartes (seuls les overlays flottants ont
`shadow-lg`), pas de `rounded-2xl`/`rounded-3xl`, pas de cartes imbriquées,
densité serrée (`p-3`/`p-4` max), des bordures (pas des ombres) pour séparer, un
hover discret (pas de `hover:shadow-md`, pas de `transition-all`), pas de
dégradés sur les cartes/KPIs, pas d'`active:` sur desktop. Justification complète
dans `.claude/CLAUDE.md`.

### Le pattern "source unique de vérité"
Le grand pari architectural : la **liste de champs publiés du mapper est le seul
endroit où un champ est déclaré**. Le frontend lit des catalogues générés côté
serveur (`<feature>/columns`, `<feature>/lines/columns`, `<feature>/describe`)
pour piloter les colonnes de la DataTable, les blocs de fiche détail et les
formulaires d'édition (`<AutoForm>`).

Bénéfice concret : pour exposer un nouveau champ Dolibarr (ou un extrafield) dans
une liste, une fiche ou un formulaire, vous ajoutez **une ligne** au
`$listOfPublishedFields` du mapper - aucune édition frontend nécessaire.

---

## 7. Démarrage (développement)

C'est une machine de dev/analyse : les applications ne sont pas censées tourner
ici comme des serveurs permanents. Les builds, l'analyse statique et les suites
de tests automatisés (éphémères) sont les workflows pris en charge.

### Installation
```sh
# Côté PHP
composer install

# Côté PWA
cd mobile && npm install
```

### Build de la PWA
```sh
cd mobile && npm run build      # Vite + vite-plugin-pwa -> dist/ + service worker
```

### Analyse statique
```sh
DOLIBARR_VERSION=18 make phpstan         # utilise les stubs Dolibarr
cd mobile && npm run lint                # oxlint d'abord, puis eslint pour le reste
```

### Tests
```sh
composer test:unit          # PHPUnit unit
composer test:integration   # PHPUnit intégration (cap-rel/dolibarr-integration-sqlite, ~5 min de bootstrap)
composer test:http          # PHPUnit HTTP (lance un php -S interne)
cd test/mobile && npx playwright test    # E2E (lance php -S + vite preview)
```

Bruit PHPStan connu et acceptable : 2 erreurs préexistantes dans `VCardHelper`.
Ne pas en introduire de nouvelles.

### Provisioning en ligne de commande (pratique pour les tests locaux)
```sh
php scripts/provision.php email@example.com "Nom de société" motdepasse
```

---

## 8. Feuille de route et où aider

La campagne en cours est **"desktop = parité Dolibarr"** : exposer
progressivement toutes les fonctionnalités de Dolibarr en mode desktop (les 93
modules cœur), tout en gardant l'UI mobile épurée (cycle commercial essentiel
uniquement). Le travail avance **lot par lot** - un lot = un objet/module livré
de bout en bout (backend + desktop + tests + commit).

Déjà livré (12 entités cœur + les lots de parité commerciale) :
- Tiers, contacts, produits, entrepôts, stock, devis, commandes, factures,
  commandes/factures fournisseur, agenda, gestion documentaire.
- `<DataTable>` desktop générique (pagination, filtres à la Dolibarr, tri, export
  CSV/XLS/ODS, colonnes pilotées par catalogue).
- Fiches détail et formulaires d'édition `<AutoForm>` pilotés par catalogue.
- Menu calculé côté serveur + permissions par feature.
- Parité Tier A à ce jour : expéditions, réceptions fournisseur, demandes de prix
  fournisseur, écriture des prix produit, factures d'acompte/récurrentes, remises
  réutilisables, variantes produit.

Bons points de départ pour contribuer (détails dans `docs/HANDOFF.md` sections
3-4) :
- Refondre les pages d'édition et fiches détail simples restantes vers le pattern
  split avec `<AutoForm>` / `<DocumentHeaderFields>`.
- Ajouter les tests d'intégration manquants pour les 7 features Tier 1.
- Investiguer la régression connue de tri descendant dans `ThirdPartyListTest`.

---

## 9. Documentation pour les contributeurs

À lire avant de toucher la zone correspondante :

- `docs/HANDOFF.md` - résumé exécutif, travail livré, travail restant, bugs
  connus, conventions strictes. **Commencez ici** si vous rejoignez le projet.
- `.claude/CLAUDE.md` - briefing dense du module (concept, conventions, journal
  de livraison complet, règles UI desktop épurées).
- `docs/DATATABLE_SPEC.md` - la spec des listes/datatable desktop.
- `prompt.md` - le brief autonome pour la campagne de parité Dolibarr.
- `docs/users/` - documentation utilisateur (français, front matter YAML).

---

## 10. Licences

Le code principal est sous GPLv3 ou (à votre choix) toute version ultérieure -
voir `COPYING`. La documentation et les readmes sont sous licence GFDL.
