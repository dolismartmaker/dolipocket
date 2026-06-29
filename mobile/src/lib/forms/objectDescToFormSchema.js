// objectDescToFormSchema
//
// Bridge between the backend `dmTrait::objectDesc()` JSON and the schema
// consumed by <AutoForm>. Pure function: no HTTP, no React.
//
// Input shape (one entry per appside field, possibly nested for FK):
//   {
//     ref:   { type, label, required, readOnly, disabled, visible, position,
//              max, defaultValue, placeholder, help, options, typeVariant,
//              multiple, is_extrafield },
//     ...
//   }
// Where `type` is one of (post-propertiesFilter):
//   varchar, text, email, phoneNumber, int, float, boolean, date, datetime,
//   select, check, sellist, url, password, html, or a class name (FK).
//
// Output shape consumed by <AutoForm>:
//   {
//     sections: [
//       { id, title, fields: [ {id, type, label, required, ...} ] },
//       ...
//     ],
//     defaults: { <fieldId>: <defaultValue>, ... }
//   }

const DEFAULT_EXCLUDE_KEYS = [
    "id",
    "rowid",
    "entity",
    "tms",
    "import_key",
    "model_pdf",
    "fk_user_creat",
    "fk_user_modif",
    "fk_user_cloture",
    "lines",
    // socid is an alias of fk_soc on every Dolibarr document object: showing
    // it as a separate field would force the user to fill the same id twice
    // and the FkPicker on fk_soc already covers the lookup. Same story for
    // socpeople which mirrors fk_socpeople on Contact.
    "socid",
    "socpeople",
];

// Mapping Dolibarr-class-name -> Dolipocket REST endpoint (singular). The
// `type` produced by the recursive FK filter in dmHelper.php is the bare
// class name (e.g. "Societe", "Contact"), so we route those to the right
// paginated index. Targets without a known endpoint stay null and the
// AutoForm renders a fallback numeric input.
const FK_ENDPOINTS = {
    Societe: "thirdparty",
    Contact: "contact",
    Product: "product",
    Entrepot: "warehouse",
    Project: "project",
    User: "user",
};

export const fkEndpointForTarget = (target) => FK_ENDPOINTS[target] ?? null;

// Types declared by `_customFilterAttributeType` in dmHelper.php that we know
// how to render with smartcommon form components.
const FIELD_TYPE_MAP = {
    varchar: "string",
    text: "text",
    email: "email",
    phoneNumber: "tel",
    int: "number",
    float: "number",
    boolean: "boolean",
    date: "date",
    datetime: "datetime",
    select: "select",
    check: "select",
    sellist: "select",
    url: "url",
    password: "password",
    html: "html",
    // Color, signature: not yet wired to smartcommon form here. Fallback below.
};

// Visibility values produced by `_customFilterAttributeVisible`:
//   []                         -> never shown
//   ["create","update","read"] -> shown everywhere
//   ["read"]                   -> read-only
//   ["update","read"]          -> not on create
//   ["create","update","read"] -> shown everywhere
const isVisibleForMode = (visible, mode) => {
    if (!Array.isArray(visible)) {
        // Unknown shape: visible by default rather than silently hiding.
        return true;
    }
    if (visible.length === 0) return false;
    return visible.includes(mode);
};

const toBool = (val) => val === true || val === 1 || val === "1";

const toAppKey = (doliKey) => {
    if (typeof doliKey !== "string") return doliKey;
    return doliKey.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
};

const isExtrafieldKey = (key) => typeof key === "string" && key.startsWith("options_");

// Convert a single objectDesc entry to an AutoForm field descriptor. Returns
// null when the entry should be skipped (invisible, lines repeater, etc.).
const buildField = (rawKey, raw, options) => {
    if (raw === null || typeof raw !== "object") {
        console.warn("[objectDescToFormSchema] entry is not an object", rawKey, raw);
        return null;
    }

    // Lines descriptor coming from parentClassNameForLines is rendered by
    // <DocumentLinesTable>, not by <AutoForm>.
    if (raw.type === "repeater") return null;

    const mode = options?.mode ?? "create";
    if (!isVisibleForMode(raw.visible, mode)) return null;

    const overrides = options?.overrides?.[rawKey] || options?.overrides?.[toAppKey(rawKey)] || null;

    const declaredType = (overrides?.type) ?? raw.type ?? "varchar";
    let mappedType = FIELD_TYPE_MAP[declaredType];

    // Fallback: if `type` is not in the map but the entry has an `options`
    // array (arrayofkeyval), treat it as a select.
    if (!mappedType && Array.isArray(raw.options) && raw.options.length > 0) {
        mappedType = "select";
    }

    // FK to a Dolibarr class. Three distinct signals can flag a FK in the
    // describe payload:
    //
    //   (a) declaredType is a class-name like "Societe" / "Project". This
    //       is what dmHelper returns when the recursive filter walks into
    //       a smartauth dm* mapper and pulls its objectDesc().
    //
    //   (b) declaredType is "object" (the same recursive walk on a target
    //       whose dm* mapper exposes objectType()=="object"). The payload
    //       carries the recursed sub-fields as siblings of `type`.
    //
    //   (c) the field key starts with `fk_` but no recursive walk happened
    //       (no dm* mapper found, or Dolibarr declared the field as a bare
    //       "integer"). dmHelper returns the field with no `type` at all
    //       (-> mappedType "string" via fallback) or with type "int" /
    //       "number". The key name is then the only signal we have.
    //
    // We unify detection by inferring the target via the key suffix when
    // the declared type does not give a usable class name.
    const FK_SUFFIX_TO_TARGET = {
        soc: "Societe",
        societe: "Societe",
        socpeople: "Contact",
        contact: "Contact",
        product: "Product",
        projet: "Project",
        project: "Project",
        entrepot: "Entrepot",
        warehouse: "Entrepot",
    };
    const inferTargetFromKey = (key) => {
        if (typeof key !== "string" || !key.startsWith("fk_")) return null;
        const guess = key.replace(/^fk_/, "");
        if (FK_SUFFIX_TO_TARGET[guess]) return FK_SUFFIX_TO_TARGET[guess];
        if (guess.startsWith("user")) return "User";
        return null;
    };

    let fkTarget = null;
    let fkEndpoint = null;

    // Signal (a): explicit class name returned by the recursive filter.
    if (typeof declaredType === "string" && /^[A-Z]/.test(declaredType) && declaredType !== "TYPE") {
        fkTarget = declaredType;
        fkEndpoint = fkEndpointForTarget(declaredType);
        if (fkEndpoint) {
            mappedType = "fk";
        } else {
            // Class returned but no known endpoint: try the key heuristic
            // as a second chance (fk_projet -> Project -> "project").
            const inferred = inferTargetFromKey(rawKey);
            if (inferred) {
                fkTarget = inferred;
                fkEndpoint = fkEndpointForTarget(inferred);
                if (fkEndpoint) mappedType = "fk";
            }
        }
    }

    // Signal (b): "object" sentinel returned by recursive walk into a dm*.
    if (mappedType !== "fk" && declaredType === "object") {
        const inferred = inferTargetFromKey(rawKey);
        if (inferred) {
            fkTarget = inferred;
            fkEndpoint = fkEndpointForTarget(inferred);
            mappedType = "fk";
        }
    }

    // Signal (c): plain numeric / string fk_* without recursive walk.
    if (mappedType !== "fk" && (mappedType === "number" || mappedType === "string" || mappedType === undefined)) {
        const inferred = inferTargetFromKey(rawKey);
        if (inferred) {
            fkTarget = inferred;
            fkEndpoint = fkEndpointForTarget(inferred);
            if (fkEndpoint) mappedType = "fk";
        }
    }

    if (!mappedType) {
        console.warn(
            "[objectDescToFormSchema] unsupported type",
            { key: rawKey, type: declaredType, fallback: "string" },
        );
        mappedType = "string";
    }

    // Multiple-select with a known `options` list comes from `chkbxlst`.
    const isMultiple = toBool(raw.multiple);

    return {
        id: toAppKey(rawKey),
        doliKey: rawKey,
        type: mappedType,
        label: overrides?.label ?? raw.label ?? rawKey,
        required: toBool(raw.required),
        readOnly: toBool(raw.readOnly),
        disabled: toBool(raw.disabled),
        placeholder: overrides?.placeholder ?? raw.placeholder ?? "",
        help: raw.help ?? "",
        max: raw.max,
        position: typeof raw.position === "number" ? raw.position : 999,
        options: overrides?.options ?? (Array.isArray(raw.options) ? raw.options : null),
        defaultValue: overrides?.defaultValue ?? raw.defaultValue,
        multiple: isMultiple,
        typeVariant: raw.typeVariant ?? null,
        isExtrafield: toBool(raw.is_extrafield) || isExtrafieldKey(rawKey),
        fkTarget,
        fkEndpoint,
        rows: raw.rows ?? null,
        icon: raw.icon ?? null,
    };
};

// Group helper: returns { sectionId, title } for a given field, based on
// `groupings` option or default ("main" vs "extra").
const resolveSectionFor = (field, groupings) => {
    if (Array.isArray(groupings) && groupings.length > 0) {
        for (const g of groupings) {
            if (Array.isArray(g.keys) && (g.keys.includes(field.id) || g.keys.includes(field.doliKey))) {
                return { id: g.id ?? g.title ?? "section", title: g.title ?? g.id ?? "Section" };
            }
        }
    }
    return field.isExtrafield
        ? { id: "extrafields", title: "Champs personnalisés" }
        : { id: "main", title: "Champs" };
};

export const objectDescToFormSchema = (desc, options = {}) => {
    if (!desc || typeof desc !== "object") {
        return { sections: [], defaults: {} };
    }

    const excludeKeys = new Set([
        ...DEFAULT_EXCLUDE_KEYS,
        ...(Array.isArray(options.excludeKeys) ? options.excludeKeys : []),
    ]);

    // Optional whitelist. When provided, only the listed keys (matched on the
    // raw Dolibarr key or its camelCase form) survive -- everything else is
    // dropped. Extrafields are always kept: their `options_*` keys are dynamic
    // and cannot be enumerated in a static whitelist. This is the robust way to
    // curate a Dolibarr object (~40 fields) down to the handful a user should
    // actually edit (mirror the mapper's $writableFields), instead of a fragile
    // blacklist that must chase every internal field (type, fk_facture_source,
    // fk_user_closing, date_closing, ...).
    const includeKeys = (Array.isArray(options.includeKeys) && options.includeKeys.length > 0)
        ? new Set(options.includeKeys)
        : null;

    const isAllowed = (rawKey) => {
        if (excludeKeys.has(rawKey) || excludeKeys.has(toAppKey(rawKey))) return false;
        if (!includeKeys) return true;
        if (includeKeys.has(rawKey) || includeKeys.has(toAppKey(rawKey))) return true;
        const entry = desc[rawKey];
        const isExtra = (entry && typeof entry === "object"
            && (entry.is_extrafield === true || entry.is_extrafield === 1))
            || isExtrafieldKey(rawKey);
        return isExtra;
    };

    // Iterate keys preserving insertion order, then re-sort by position.
    const fields = [];
    Object.keys(desc).forEach((rawKey) => {
        if (!isAllowed(rawKey)) return;
        const built = buildField(rawKey, desc[rawKey], options);
        if (built) fields.push(built);
    });

    fields.sort((a, b) => {
        if (a.position !== b.position) return a.position - b.position;
        return 0;
    });

    // Group fields per section.
    const sectionsMap = new Map();
    for (const field of fields) {
        const section = resolveSectionFor(field, options.groupings);
        if (!sectionsMap.has(section.id)) {
            sectionsMap.set(section.id, { id: section.id, title: section.title, fields: [] });
        }
        sectionsMap.get(section.id).fields.push(field);
    }

    // Honour the order from options.groupings if provided, else insertion.
    let sections;
    if (Array.isArray(options.groupings) && options.groupings.length > 0) {
        sections = [];
        for (const g of options.groupings) {
            const sId = g.id ?? g.title ?? "section";
            if (sectionsMap.has(sId)) {
                sections.push(sectionsMap.get(sId));
                sectionsMap.delete(sId);
            }
        }
        sections.push(...sectionsMap.values());
    } else {
        sections = Array.from(sectionsMap.values());
    }

    // Defaults: { fieldId: defaultValue }.
    const defaults = {};
    for (const field of fields) {
        if (field.defaultValue !== undefined && field.defaultValue !== null) {
            defaults[field.id] = field.defaultValue;
        }
    }

    return { sections, defaults };
};
