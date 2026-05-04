# DataTable desktop - Spécification

> **Mise à jour 2026-05-04** : la v1 livrée duplique la connaissance des champs (mapper backend + filterMap controller + sortableMap controller + listConfig frontend). La v2 (en cours) supprime cette duplication en s'appuyant sur l'introspection `$object->fields` Dolibarr déjà exposée par `dmTrait::objectDesc()`. Section "13. v2 -- Single source of truth" en bas.
>
> Statut : spécification figée le 2026-05-04. Implémentation à venir.
> Périmètre : redesign complet de la mise en page **ordinateur** des pages de liste.
> Cible v1 : `/contacts` et `/thirdparties` (URLs React, pluriel). Extension prévue ensuite à `/products`, `/invoices`, `/supplier-invoices`.
>
> **Convention de routage du module** : les URLs React Router sont au **pluriel** (`/contacts`, `/thirdparties`), les endpoints API HTTP sont au **singulier** (`GET /contact`, `GET /thirdparty`, etc.). Cette spec utilise les deux selon le contexte.

Ce document est le **contrat unique** entre l'agent qui code et l'utilisateur. Il décrit l'architecture, les choix tranchés, l'API serveur, le format de configuration par liste, et les règles de comportement. Toute déviation du code par rapport à ce document doit être justifiée explicitement, sinon corrigée.

## 1. Contexte et intention

Les pages "index" des CRUD doivent reproduire l'expérience des **listes Dolibarr PHP** côté ordinateur :

- En-têtes de colonnes triables (un seul critère à la fois)
- Une ligne de filtres sous les en-têtes, un input/select par colonne, bouton "Rechercher" qui déclenche la requête
- Sélecteur de colonnes visibles, ordre des colonnes modifiable, largeur des colonnes ajustable
- Toutes ces préférences (visibilité, ordre, largeurs, filtres saisis, tri, taille de page) **persistées par liste** en `localStorage`
- Numérotation de ligne dans une colonne `#` masquable comme les autres
- Cases à cocher pour sélection multiple et **actions de masse**
- Colonne d'**actions par ligne** à droite (icônes fixes) plus un menu kebab pour les actions avancées
- Export **ODS / XLS / CSV** des lignes visibles
- Pagination classique (1, 2, 3, ...) avec choix 25/50/100 par page
- **Densité Dolibarr** (lignes serrées, plus de lignes à l'écran que la HomePage)

Le rendu **mobile** existant (cartes empilées) **n'est pas modifié** par ce travail. La `<DataTable>` est rendue exclusivement dans les fichiers `*.desktop.jsx`.

## 2. Architecture générale

### 2.1 Composant `<DataTable>` générique

Un seul composant `<DataTable config={listConfig} dataSource={...} />` consommé par toutes les pages de liste desktop. Pas de DataTable par entité.

Chaque page déclare une `listConfig.jsx` qui décrit ses colonnes, ses filtres, ses actions de ligne et ses actions de masse. Le composant gère tout le reste (UI, pipeline de données, persistence des préférences, export).

### 2.2 Arborescence des fichiers

```
mobile/src/lib/datatable/
  index.jsx                       # exports publics
  DataTable/
    index.jsx                     # composant principal
    Header/
      index.jsx                   # ligne d'en-têtes
      ColumnHeader.jsx            # 1 en-tête (tri + handle drag mode édition + handle resize)
    FilterRow/
      index.jsx                   # ligne de filtres + bouton "Rechercher"
      filters/
        TextFilter.jsx
        SelectFilter.jsx
        DateRangeFilter.jsx
        NumberRangeFilter.jsx
        BooleanFilter.jsx
    Body/
      index.jsx                   # tbody
      Row.jsx                     # tr avec case + cells + actions + kebab
    Footer/
      index.jsx                   # pagination + sélecteur taille de page
    BulkActionBar/
      index.jsx                   # barre d'actions de masse (visible si selection > 0)
    ColumnConfigurator/
      index.jsx                   # mode édition (drag handles + checkboxes visibilité)
    hooks/
      useDataTablePrefs.js        # persistence localStorage par storageKey
      useDataPipeline.js          # mode A (client) ou mode B (serveur), bascule auto
      useColumnResize.js          # drag de la frontière entre colonnes
      useColumnReorder.js         # drag des en-têtes en mode édition
      useRowSelection.js          # sélection multi (page courante uniquement)
    utils/
      exportRows.js               # CSV in-house + XLS/ODS via dynamic import xlsx
```

```
mobile/src/components/pages/private/ContactsPage/
  index.jsx                       # routeur viewport (déjà existant ou à créer)
  useContactsData.js              # hook data (extrait de l'existant)
  ContactsPage.mobile.jsx         # rendu mobile actuel inchangé
  ContactsPage.desktop.jsx        # NOUVEAU -> rend <DataTable config={listConfig} ... />
  listConfig.jsx                  # NOUVEAU -> colonnes + filtres + actions
```

Idem pour `ThirdPartiesPage`. Promotion future vers `@cap-rel/smartcommon` une fois validée sur 2-3 listes.

## 3. Pipeline de données : mode auto

### 3.1 Bascule mode A / mode B

Au mount de la `<DataTable>`, on appelle `dataSource.count()` (HTTP `GET /<feature-singular>/count?<filtres>`).

- Si `total <= 5000` -> **mode A (client)** : on charge toutes les lignes en une fois via `dataSource.list({})` (sans filtres ni pagination). Filtres, tri et pagination sont calculés **côté client** sur le tableau en mémoire.
- Si `total > 5000` -> **mode B (serveur)** : chaque changement de filtre, tri ou page déclenche un nouveau fetch `dataSource.list({filters, sort, page, limit})`. La réponse est `{items, total, page, limit}`.

Le seuil 5000 est configurable dans la `listConfig` via `clientThreshold` (par défaut 5000).

### 3.2 Re-probe à chaque mount

La décision mode A vs mode B est **recalculée à chaque mount** de la page. Pas de cache localStorage de la décision : si l'utilisateur ajoute massivement des contacts, la prochaine entrée sur la page bascule automatiquement en mode B. Le coût d'un `count` est négligeable (~50 bytes JSON, requête SQL `COUNT(*)`).

### 3.3 Cohérence visuelle

Le composant `<DataTable>` se comporte **strictement de la même manière** dans les deux modes du point de vue UI. Seul le pipeline interne change.

## 4. Contrat HTTP

### 4.1 Endpoint de count

```
GET /<feature-singular>/count
    ?search=acme
    &filter[country]=FR
    &filter[type]=customer
    &filter[created_from]=2025-01-01
    &filter[created_to]=2025-12-31
    &filter[amount_min]=100
    &filter[amount_max]=5000
    &filter[active]=1

Response 200:
{
    "total": 1247
}
```

Appelé une fois au mount pour décider mode A vs B. Pas de re-call sur changement de filtre (le total paginé suffit ensuite).

### 4.2 Endpoint de liste paginée

```
GET /<feature-singular>
    ?search=acme                    # global, multi-champs (name + email + code...)
    &filter[country]=FR             # un filtre par colonne
    &filter[type]=customer
    &filter[created_from]=2025-01-01    # daterange -> _from / _to
    &filter[created_to]=2025-12-31
    &filter[amount_min]=100             # numberrange -> _min / _max
    &filter[amount_max]=5000
    &filter[active]=1                   # boolean -> 1 / 0 / absent (= tous)
    &sort=name                          # un seul critère
    &order=asc                          # asc | desc
    &page=2                             # 1-indexed
    &limit=50                           # 25 | 50 | 100

Response 200 (mode B):
{
    "items": [...],
    "total": 1247,
    "page": 2,
    "limit": 50
}
```

### 4.3 Backward compatibility

Quand l'endpoint est appelé **sans aucun paramètre** (ou avec uniquement des params métier déjà existants), le controller retourne le **format legacy** (un array brut de tous les enregistrements). Cela évite de casser les appels actuels de `useDb<Feature>().list({})`.

La présence d'au moins un des params `search`, `filter[*]`, `sort`, `page`, `limit` bascule la réponse en format paginé `{items, total, page, limit}`.

### 4.4 Combinaison des filtres

`search` (global) et chaque `filter[col]` se combinent **en AND** dans le WHERE SQL. C'est le comportement Dolibarr PHP standard.

### 4.5 Endpoint bulk delete

```
DELETE /<feature-singular>
Body: { "ids": [1, 2, 3, ...] }    # max 100 ids

Response 200:
{
    "success": [1, 2],
    "errors": [
        {"id": 3, "reason": "Linked to invoice F2025-001"}
    ]
}
```

Le serveur tente la suppression de chaque id, retourne le récap. Pas de transaction globale : un échec partiel n'annule pas les succès. Le client affiche un toast récapitulatif.

**Pas de delete par filtre** (`DELETE /thirdparty?filter[country]=FR`) en v1, trop dangereux.

### 4.6 Validation côté Dolibarr

Chaque controller qui implémente le pipeline paginé doit déclarer les schémas correspondants dans `class/actions_dolipocket.class.php` (hook `smartmaker_addValidationSchemas`), sinon le sanitize générique tronque les filtres à 255 chars (cf SMARTMAKER.md section 9).

Schéma type :

```php
'GET:thirdparties' => [
    'search' => ['type' => 'string', 'maxLen' => 255],
    'filter' => ['type' => 'array', 'itemType' => 'string'],
    'sort'   => ['type' => 'alphanumeric'],
    'order'  => ['type' => 'alphanumeric'],
    'page'   => ['type' => 'int', 'min' => 1],
    'limit'  => ['type' => 'int', 'min' => 1, 'max' => 100],
],
'GET:thirdparties/count' => [
    'search' => ['type' => 'string', 'maxLen' => 255],
    'filter' => ['type' => 'array', 'itemType' => 'string'],
],
'DELETE:thirdparties' => [
    'ids' => ['type' => 'array', 'itemType' => 'int'],
],
```

## 5. Format de la `listConfig`

Une page de liste fournit un objet de configuration. Exemple complet pour Contacts :

```jsx
import { FaEye, FaPen, FaTrash, FaFileCsv, FaFileExcel, FaFileLines, FaPlus, FaTags } from "react-icons/fa6";

export const contactsListConfig = {
    storageKey: "dolipocket.list.contacts",  // namespace localStorage des prefs
    rowKey: (row) => row.id,
    defaultSort: { col: "lastname", order: "asc" },
    defaultPageSize: 50,
    pageSizeOptions: [25, 50, 100],
    clientThreshold: 5000,                    // seuil mode A / mode B

    // Recherche globale (input texte au-dessus de la table). Optionnel.
    globalSearch: {
        placeholder: "Rechercher un contact...",
    },

    columns: [
        // Colonne numérotation, masquable comme les autres.
        { key: "_rownum", label: "#", type: "rownum", defaultVisible: true, defaultWidth: 50 },

        { key: "lastname",   label: "Nom",      type: "string", filter: "text",   sortable: true,  defaultVisible: true,  defaultWidth: 180 },
        { key: "firstname",  label: "Prénom",   type: "string", filter: "text",   sortable: true,  defaultVisible: true,  defaultWidth: 160 },
        { key: "email",      label: "Email",    type: "email",  filter: "text",   sortable: true,  defaultVisible: true,  defaultWidth: 240 },
        { key: "phone",      label: "Téléphone", type: "phone", filter: "text",   sortable: false, defaultVisible: false, defaultWidth: 140 },
        { key: "thirdparty", label: "Société",  type: "string", filter: "text",   sortable: true,  defaultVisible: true,  defaultWidth: 200 },

        // Filtre select -> options statiques ou async fetcher.
        { key: "country", label: "Pays", type: "string", filter: { kind: "select", options: () => fetchCountries() }, sortable: true, defaultVisible: false, defaultWidth: 100 },

        // Filtre daterange : génère _from / _to dans la querystring.
        { key: "createdAt", label: "Créé le", type: "date", filter: "daterange", sortable: true, defaultVisible: false, defaultWidth: 120 },

        // Filtre booléen (oui / non / tous).
        { key: "active", label: "Actif", type: "boolean", filter: "boolean", sortable: false, defaultVisible: true, defaultWidth: 80 },
    ],

    // Actions sur 1 ligne, icônes fixes à droite. Max 3 recommandé.
    rowActions: [
        { key: "view", icon: FaEye, label: "Voir",
          onClick: (row, ctx) => ctx.navigate(`/contacts/${row.id}`) },
        { key: "edit", icon: FaPen, label: "Modifier",
          onClick: (row, ctx) => ctx.navigate(`/contacts/${row.id}/edit`) },
    ],

    // Menu kebab (...) : actions secondaires. Confirmable, async possible.
    rowKebabActions: [
        { key: "duplicate", label: "Dupliquer",
          onClick: async (row, ctx) => { await ctx.api.post(`contacts/${row.id}/duplicate`); ctx.refresh(); } },
        { key: "delete", label: "Supprimer", danger: true,
          confirm: { title: "Supprimer ce contact ?", danger: true },
          onClick: async (row, ctx) => { await ctx.api.delete(`contacts/${row.id}`); ctx.refresh(); } },
    ],

    // Actions de masse (sur la sélection courante).
    bulkActions: [
        { key: "delete", label: "Supprimer", icon: FaTrash, danger: true,
          confirm: ({selected}) => ({
              title: `Supprimer ${selected.length} contact${selected.length > 1 ? "s" : ""} ?`,
              danger: true,
          }),
          run: async (rows, ctx) => {
              const res = await ctx.api.delete("contacts", { json: { ids: rows.map(r => r.id) } }).json();
              ctx.toast.success(`${res.success.length} supprimés${res.errors.length ? `, ${res.errors.length} en erreur` : ""}`);
              ctx.refresh();
          } },
        { key: "export-csv", label: "Exporter CSV", icon: FaFileCsv,
          run: (rows, ctx) => ctx.exportRows("csv") },
        { key: "export-xls", label: "Exporter XLS", icon: FaFileExcel,
          run: (rows, ctx) => ctx.exportRows("xls") },
        { key: "export-ods", label: "Exporter ODS", icon: FaFileLines,
          run: (rows, ctx) => ctx.exportRows("ods") },
        { key: "categorize", label: "Catégoriser", icon: FaTags,
          run: async (rows, ctx) => ctx.openCategoryPicker(rows) },
    ],

    // Actions au niveau page (à droite du titre). Optionnel.
    headerActions: [
        { key: "new", label: "Nouveau contact", icon: FaPlus, primary: true,
          onClick: (ctx) => ctx.navigate("/contacts/new") },
    ],
};
```

### 5.1 Types de filtres supportés

| `filter` | Génère côté UI | Querystring |
|----------|---------------|-------------|
| `"text"` | input texte | `filter[col]=foo` |
| `{kind: "select", options}` | dropdown | `filter[col]=value` |
| `"daterange"` | 2 datepickers | `filter[col_from]=YYYY-MM-DD&filter[col_to]=...` |
| `"numberrange"` | 2 inputs nombre | `filter[col_min]=10&filter[col_max]=100` |
| `"boolean"` | tri-state (oui/non/tous) | `filter[col]=1` ou `filter[col]=0` (absent = tous) |
| `{kind: "custom", Component}` | rendu fourni | format libre, à mapper côté serveur |

Pas de filtre = pas d'input affiché sous l'en-tête de cette colonne.

### 5.2 Le `ctx` injecté dans les callbacks

Le composant passe à chaque callback (`onClick`, `run`) un objet `ctx` avec :

- `ctx.navigate(path)` -> wrapper de `useNavigate()`
- `ctx.api` -> client `useApi().private` (cf SMARTMAKER.md "useApi : syntaxe ky")
- `ctx.refresh()` -> re-fetch la page courante
- `ctx.toast` -> `{success, error, info}` (react-hot-toast)
- `ctx.confirm` -> `useConfirm().confirm` (smartcommon)
- `ctx.exportRows(format)` -> déclenche l'export (csv/xls/ods)
- `ctx.openCategoryPicker(rows)` -> exemple, ce sera des helpers à ajouter au cas par cas

## 6. Préférences persistées

Une seule clé `localStorage` par liste, sous `storageKey`. Contenu :

```json
{
    "columns": [
        {"key": "_rownum",   "visible": true,  "width": 50},
        {"key": "lastname",  "visible": true,  "width": 200},
        {"key": "firstname", "visible": true,  "width": 160},
        {"key": "email",     "visible": false, "width": 240},
        ...
    ],
    "sort":     {"col": "lastname", "order": "asc"},
    "pageSize": 50,
    "filters": {
        "search":   "acme",
        "byColumn": {"country": "FR"}
    }
}
```

L'ordre du tableau `columns` est l'ordre d'affichage. Les colonnes absentes du `localStorage` (typiquement après ajout d'une nouvelle colonne dans la `listConfig`) sont insérées **à la fin** avec leurs valeurs par défaut.

Migration / réinitialisation : un bouton "Réinitialiser" dans le `<ColumnConfigurator>` reset à la `listConfig`.

## 7. Comportements UI précis

### 7.1 Tri
- Un seul critère à la fois.
- Clic sur en-tête trie ASC. Re-clic = DESC. Re-re-clic = pas de tri (revient à l'ordre par défaut de la `listConfig`).
- Petite flèche `↑` / `↓` à droite du libellé d'en-tête pour la colonne triée. (Note : le caractère réel utilisé sera un Icon SVG, pas le caractère unicode -- ASCII pur partout dans le code.)

### 7.2 Filtres et bouton "Rechercher"
- Une ligne sous les en-têtes, un input/select aligné sur chaque colonne filtrable.
- Les saisies ne déclenchent **pas** de fetch automatique (pas de debounce magique). L'utilisateur doit cliquer **Rechercher** (ou presser Entrée dans un input).
- Un bouton **Réinitialiser** à côté de Rechercher vide tous les filtres.
- Les filtres saisis sont persistés en `localStorage` (cf §6) et restaurés à la prochaine entrée sur la page.

### 7.3 Pagination
- Pages classiques `<<  <  1  2  3  ...  N  >  >>`
- Sélecteur "25 / 50 / 100 par page" à droite, persisté.
- Au-dessus de la pagination : `Affichage 51-100 sur 1247`.

### 7.4 Sélection
- Case à cocher dans la première colonne (avant `#`). Non masquable.
- Case à cocher dans l'en-tête : coche **les lignes visibles de la page courante**.
- Sélection **purgée** au changement de filtre, de tri ou de page.
- Quand `selection.length > 0` -> apparition de la `<BulkActionBar>` flottante en bas de l'écran avec le compteur ("12 sélectionnés") et les boutons d'actions de masse définis dans la `listConfig`.

### 7.5 Colonne `#` (numérotation)
- Type spécial `"rownum"`. Affiche l'index 1-indexé de la ligne **dans la page courante** (donc 1-50 sur la page 1, 51-100 sur la page 2 si pageSize=50).
- Masquable comme les autres colonnes.

### 7.6 Actions de ligne
- **Icônes fixes** à droite (max 3) : par défaut Voir + Modifier. Définies dans `rowActions`.
- **Menu kebab** (3 points verticaux) à droite des icônes pour les actions avancées. Définies dans `rowKebabActions`.
- Cliquer sur une zone vide de la ligne (en dehors de la case et des actions) navigue vers le détail (équivalent action "view"). À confirmer : **par défaut activé**, désactivable via `rowClick: false` dans la `listConfig`.

### 7.7 Réorganisation des colonnes (mode édition)
- Bouton "Configurer les colonnes" en haut à droite de la table.
- Au clic, la table passe en **mode édition** : les en-têtes affichent une poignée de drag (`⠿`) à gauche du libellé, et une checkbox de visibilité.
- Drag & drop des en-têtes pour réordonner.
- Décocher une checkbox masque la colonne (non supprimable, juste cachée).
- Bouton "Terminer" sort du mode édition. Les changements sont persistés en `localStorage` au fur et à mesure (pas besoin de sauver).
- Le tri par clic sur en-tête est **désactivé** en mode édition (sinon conflit avec le drag).

### 7.8 Largeur des colonnes (resize)
- En **mode normal** (pas en édition), une zone de 4px à droite de chaque cellule d'en-tête est cliquable et permet de glisser pour redimensionner.
- Curseur `col-resize` au survol.
- Largeur min : 50px. Largeur max : 800px.
- Double-clic sur la zone de resize -> auto-fit (largeur = max(libellé + padding, contenu max sur la page courante)).
- Persistée en `localStorage` au relâchement (pas pendant le drag).

### 7.9 Layout
- `<DataTable>` occupe la pleine largeur disponible du conteneur parent.
- Si la somme des largeurs de colonnes dépasse le viewport, **scroll horizontal** sur l'élément table.
- Colonnes **sticky** :
  - Case à cocher (gauche)
  - `#` (rownum, gauche, après la case)
  - Première colonne data visible (gauche, après le `#`) -- typiquement le nom
  - Actions + kebab (droite)
- Le scroll horizontal n'affecte ni la colonne sticky gauche ni la colonne sticky droite.

### 7.10 Densité
- Hauteur de ligne cible : **32px** (à la Dolibarr). Padding vertical 6px. Police 13px.
- En-têtes 36px, padding 8px, police 12px semibold.
- Filtres 32px, padding 4px.
- Comparaison : la HomePage actuelle utilise des lignes 48-56px. La DataTable est volontairement plus dense.

## 8. Export ODS / XLS / CSV

### 8.1 Périmètre exporté
- **Lignes visibles de la page courante uniquement** (Q1bis tranché).
- **Colonnes visibles dans l'ordre courant** (WYSIWYG). Les colonnes masquées ne sont pas exportées.

### 8.2 Implémentation
- **CSV** : génération in-house (séparateur `;` pour Excel FR, BOM UTF-8). Pas de dépendance.
- **XLS / ODS** : via `xlsx` (SheetJS), chargé en `dynamic import()` pour ne pas alourdir le bundle de base. La lib gère les deux formats.
- Le nom du fichier est `<feature>-<YYYYMMDD-HHMMSS>.<ext>` par défaut (ex: `contacts-20260504-153012.csv`).
- Les valeurs sont passées par les `formatters` de chaque colonne (donc le fichier reflète exactement ce qui est à l'écran : dates formatées FR, montants avec virgule, etc.).

## 9. Cache offline (Dexie)

Le mode offline de Dolipocket est **activé manuellement** par l'utilisateur (toggle dédié, hors scope DataTable). Quand il l'active :

- Le DataTable continue de tourner en mode A ou B selon le seuil.
- En mode A, `dataSource.list({})` charge tout, donc Dexie est trivialement réchauffé via les `useDb<Feature>` existants.
- En mode B, il faut prévoir un **job de sync séparé** qui pull tous les enregistrements par lots de 1000 (à câbler quand le mode offline activable sera implémenté). C'est **hors scope** de la v1 du DataTable.

La `<DataTable>` consomme `dataSource` (mode B) ou un tableau brut (mode A) **sans se soucier de Dexie**. Les deux pipelines sont découplés.

## 10. Gestion des erreurs

### 10.1 Bulk delete
- Le serveur retourne `{success, errors}` (cf §4.5).
- Le client affiche un toast unique : `"8 supprimés, 4 en erreur (cliquez pour détails)"` qui ouvre une modale listant chaque échec et sa raison.
- Les lignes en succès sont retirées de la sélection et de l'affichage. Les lignes en erreur restent visibles.

### 10.2 Fetch en erreur
- Si `dataSource.list()` ou `dataSource.count()` throw, on affiche une bannière en haut de la table : `"Erreur de chargement. [Réessayer]"`.
- Le bouton Réessayer relance la dernière requête.

### 10.3 Filtres invalides
- Si l'utilisateur saisit un filtre que le backend rejette (par exemple une date mal formée), le serveur retourne `400 Bad Request` avec `{error: "..."}`. Le client affiche un toast d'erreur et garde la table dans l'état précédent (ne vide pas).

## 11. Découpage de l'implémentation

### Phase 1 - Backend (PHP)
1. Trait `Dolipocket\Api\Trait\PaginatedListTrait` -- helper générique de parsing query string et construction des SQL filtres.
2. `ThirdPartyController::index` étendu (params + format paginé conditionnel + backward compat).
3. `ThirdPartyController::count` (nouveau).
4. `ThirdPartyController::deleteBulk` (nouveau).
5. Idem pour `ContactController`.
6. Schémas de validation dans `class/actions_dolipocket.class.php` pour les 6 nouvelles routes (cf §4.6).
7. Tests d'intégration : 1 test par endpoint sur `phpunit-integration-dolibarr.xml`.

### Phase 2 - Frontend (React)
8. `mobile/src/lib/datatable/` -- arbo complète (cf §2.2).
9. Extension de `useDbContacts` et `useDbThirdParties` : nouvelle méthode `listPaged({...})` et `count({...})`. Backward compat garantie pour `list({})` legacy.
10. Refactor `ContactsPage` en `index.jsx` + `useContactsData.js` + `*.mobile.jsx` + `*.desktop.jsx` + `listConfig.jsx`.
11. Idem `ThirdPartiesPage`.
12. Build PWA OK + tests visuels manuels.

### Phase 3 - Documentation et remontée
13. Mise à jour de `~/docs/SMARTMAKER.md` avec le pattern (référence vers ce fichier).
14. Mise à jour de `.claude/CLAUDE.md` du module avec la liste des pages refactorées et l'état du chantier.
15. Phase ultérieure (hors v1) : promotion de `<DataTable>` dans `@cap-rel/smartcommon`, page wiki dédiée, retrait du code local et bascule sur l'import smartcommon.

### Pages hors scope v1
- `/products`, `/invoices`, `/supplier-invoices` : viendront en deuxième vague une fois le pattern stabilisé sur `/contacts` et `/thirdparties`.
- `/warehouses`, `/stock`, `/proposals`, `/orders`, `/supplier-orders`, `/agenda`, `/documents` : restent en mode A pur (pas de pipeline serveur), interface inchangée tant qu'aucun besoin réel n'apparaît.

## 12. Décisions tranchées (résumé)

| Question | Décision |
|----------|----------|
| Filtres | "à la Dolibarr" : ligne sous en-têtes + bouton "Rechercher" |
| Filtrage client / serveur | Mode auto (probe `count` au mount, seuil 5000) |
| Pagination | Pages classiques 1/2/3, choix 25/50/100 |
| Numérotation | Colonne `#` masquable comme les autres |
| Drag & drop colonnes | Mode édition (bouton Configurer -> handles + checkboxes) |
| Persistence colonnes | Par liste, `localStorage` |
| Persistence filtres | Par liste, `localStorage` |
| Densité | Dense, à la Dolibarr |
| Resize colonnes | Oui, persisté |
| Tri | Un seul critère |
| Export | WYSIWYG, lignes visibles, colonnes visibles dans l'ordre courant |
| Sélection vs filtre | Effacée au changement de filtre, tri ou page |
| Erreurs delete bulk | Récap `{success, errors}` côté serveur, toast au user |
| Layout | Pleine largeur + scroll horizontal + colonnes sticky (case, `#`, première colonne, actions) |
| Cache offline | Hors scope DataTable, géré séparément quand mode offline activé manuellement |
| Recherche globale + filtres | Combinés en AND |
| Bulk delete | Par ids uniquement (max 100), pas de delete par filtre |
| Probe mode A / B | Re-vérifié à chaque mount, pas de cache de la décision |
| API canonique React | `useDb<Feature>().list({})` legacy + nouveau `listPaged({...})` et `count({...})` |
| Pages cibles v1 (URLs React) | `/contacts` + `/thirdparties` |
| Tier 1 backend (mode auto) | ThirdParty, Contact, Product, Invoice, SupplierInvoice |
| Tier 2 backend (mode A pur) | Warehouse, Stock, Proposal, Order, SupplierOrder, Agenda, Documents |

## 13. v2 -- Single source of truth (en cours, 2026-05-04)

### Constat

La v1 stocke la connaissance des champs en 4 endroits :
- `dmThirdParty::$listOfPublishedFields` (mapping API)
- `ThirdPartyController::$filterMap` (whitelist filtres SQL)
- `ThirdPartyController::$sortableMap` (whitelist tri SQL)
- `thirdPartiesListConfig.columns` (UI : label, type, filter, width)

Ajouter une colonne (ex : `zip` / "Code postal") oblige à éditer 4 endroits, et les labels Dolibarr (`$object->fields['zip']['label']`) sont dupliqués en français côté front. C'est intenable à grande échelle.

### Cible v2

**Une seule source : le mapper backend.** Le mapper expose un **catalogue de colonnes** dérivé de :
- `$listOfPublishedFields` (whitelist des champs exposés par l'API)
- `Dolibarr\<ParentClass>::$fields` (introspection : label, type, visible, searchable, position)
- les extrafields actifs (via `\ExtraFields::fetch_name_optionals_label`)

Le `dmTrait::objectDesc()` fait DÉJÀ cette fusion (ligne 111+ de `~/dev/smartauth/dolMapping/dmTrait.php`). On l'expose via un nouvel endpoint et on enrichit avec les hints UI nécessaires au DataTable.

### Backend (changements)

1. **Nouvelle méthode `dmTrait::getColumnCatalog()`** -- normalise la sortie de `objectDesc()` en un format dédié au DataTable :
   ```php
   [
       [
           'key' => 'zip',                 // appside (= clé renvoyée dans le JSON par exportMappedData)
           'label' => 'Code postal',       // depuis $fields[$doliside]['label'], traduit via $langs->trans
           'type' => 'string',             // 'string' | 'int' | 'float' | 'date' | 'datetime' | 'boolean' | 'select'
           'sortable' => true,             // par défaut true sauf type=text long ou explicit false dans le mapper
           'filterable' => true,           // par défaut true. Type select -> filterKind 'select' avec options. Type date -> 'daterange'. Etc.
           'filterKind' => 'text',         // 'text' | 'select' | 'daterange' | 'numberrange' | 'boolean'
           'filterOptions' => null,        // pour kind=select : array de {value, label}, ou null si dynamique
           'defaultVisible' => false,      // dérivé de $fields['visible'] (1 = visible, -1 = invisible mais admin, etc.)
           'defaultWidth' => 140,          // heuristique selon type ; surchargeable côté front
           'group' => 'main' | 'extra' | 'extrafield',  // pour grouper dans le ColumnConfigurator
       ],
       ...
   ]
   ```

2. **Endpoint générique** `GET /<feature>/columns` -- renvoie `$mapper->getColumnCatalog()`. Pas d'authentification spécifique au-delà du JWT standard. Cacheable côté HTTP (Cache-Control 1h, le catalogue change rarement).

3. **`PaginatedListTrait::buildSqlFilters` / `buildSortClause` consomment le catalogue** au lieu d'un `$filterMap` / `$sortableMap` hardcodé dans chaque controller. Le mapping appside -> doliside est connu via `$listOfPublishedFields`. Toute colonne du catalogue avec `filterable: true` est filtrable, idem pour `sortable`. Les controllers Tier 1 (ThirdParty, Contact, Product, Invoice, SupplierInvoice) n'ont plus besoin de redéclarer ces maps.

4. **`GET /<feature>` accepte `?include=col1,col2,...`** -- pour ne renvoyer que les colonnes demandées par le client (économie de bande passante quand l'user a une liste personnalisée). `dmBase::exportMappedData($obj, $includeKeys = null)` accepte la liste optionnelle. Si null = comportement actuel (toutes les colonnes mappées).

5. **Schémas de validation `smartmaker_addValidationSchemas`** -- ajout de `'include' => ['type' => 'string', 'maxLen' => 1000]` (CSV simple, parsé côté trait).

### Frontend (changements)

1. **`<DataTable>` charge le catalogue au mount** :
   ```jsx
   const catalog = await dataSource.columns(); // GET /<feature>/columns
   ```
   En cache localStorage `dolipocket.list.<feature>.catalog` pour que la page ouvre instantanément même offline ; revalidation en arrière-plan. TTL 1 jour côté client.

2. **`listConfig.jsx` devient minimal** -- ne déclare que les **overrides** :
   ```jsx
   export const thirdPartiesListConfig = {
       storageKey: "dolipocket.list.thirdparties",
       defaultSort: { col: "name", order: "asc" },
       defaultPageSize: 50,
       pageSizeOptions: [25, 50, 100],
       clientThreshold: 5000,
       globalSearch: { placeholder: "Rechercher un tiers..." },
       columnsOverrides: {
           // Surcharges optionnelles : largeur custom, formatter, force defaultVisible.
           name:       { defaultVisible: true,  defaultWidth: 200 },
           codeClient: { defaultVisible: true,  defaultWidth: 140 },
           email:      { defaultVisible: true,  defaultWidth: 240 },
           town:       { defaultVisible: true,  defaultWidth: 160 },
           client:     { defaultVisible: true,  defaultWidth: 80 },
       },
       rowActions: [...],
       rowKebabActions: [...],
       bulkActions: [...],
       headerActions: [...],
   };
   ```
   La colonne `_rownum` reste injectée par le DataTable (pas dans le catalogue serveur).

3. **`<ColumnConfigurator>` enrichi** -- liste **toutes** les colonnes du catalogue (`group: main` puis `extra` puis `extrafield`). Cocher = ajouter à la liste visible (et la persister dans `localStorage["dolipocket.list.<feature>"].columns`). Décocher = masquer. La position dans `localStorage` est respectée pour l'ordre.

4. **`?include=` propagé** -- `dataSource.listPaged({ include: visibleColumnsKeys })` envoie la liste des colonnes actuellement affichées. Le backend ne renvoie que ces colonnes (économie sur les listes 100 lignes x 30 colonnes mappées).

### Fallback

Si `GET /<feature>/columns` échoue (offline + cache vide, 500, 404), le DataTable affiche une bannière "Catalogue indisponible, fonctionnalité limitée" et utilise `columnsOverrides` seuls comme fallback minimal. Pas de mode édition possible dans ce cas.

### Migration v1 -> v2

Pas de breaking change utilisateur. Les `localStorage` v1 existants sont compatibles : la fusion catalogue + prefs locales gère naturellement les colonnes connues / inconnues.

Côté backend, les `filterMap` / `sortableMap` hardcodés des controllers Tier 1 sont supprimés (DRY). Les schémas de validation acceptent `include` en plus.

### Découpage de l'implémentation

**Phase 1 -- Backend** :
- `dmTrait::getColumnCatalog()` qui normalise `objectDesc()` pour le DataTable
- `dmBase::exportMappedData($obj, $includeKeys = null)` accepte le filtrage par clés
- Endpoint générique `<Controller>::columns()` (méthode mixin) ; routes ajoutées dans `pwa/api.php` pour ThirdParty + Contact (+ Tier 1 ensuite)
- Refactor `PaginatedListTrait` pour utiliser le catalogue (suppression des maps hardcodées dans les controllers)
- Schémas `smartmaker_addValidationSchemas` enrichis avec `include`
- Tests d'intégration pour `/thirdparty/columns` et `/contact/columns`

**Phase 2 -- Frontend** :
- Extension `useDb<Feature>().columns()` qui appelle l'endpoint et cache en `localStorage`
- `<DataTable>` charge le catalogue au mount, fusionne avec `columnsOverrides` du `listConfig`
- `<ColumnConfigurator>` liste toutes les colonnes du catalogue (groupées : main / extra / extrafield)
- Migration des 2 `listConfig.jsx` (Contacts + ThirdParties) pour passer en mode "overrides"
- Build PWA OK + test manuel de l'ajout dynamique de colonne (ex : "code postal" via le mode édition)

**Phase 3 -- Documentation** :
- Mise à jour `~/docs/SMARTMAKER.md` section 9 (DataTable) avec la nouvelle approche
- Mise à jour `.claude/CLAUDE.md` avec le statut v2 livrée
