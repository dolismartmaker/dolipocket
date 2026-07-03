// Default visible fields of the thirdparty "Coordonnées" card (consumed by the
// desktop cockpit and by the tablet master-detail pane). Everything else (extra
// professional ids, extrafields, ...) stays one click away in the embedded
// catalog-driven "Champs" panel. Kept in its own module so component files only
// export components (react-refresh fast-refresh constraint).
export const HEADER_OVERRIDES = {
    name:            { defaultVisible: true },
    nameAlias:       { defaultVisible: true },
    codeClient:      { defaultVisible: true },
    codeFournisseur: { defaultVisible: true },
    client:          { defaultVisible: true, formatter: (v) => (Number(v) > 0 ? "Oui" : "Non") },
    fournisseur:     { defaultVisible: true, formatter: (v) => (Number(v) > 0 ? "Oui" : "Non") },
    address:         { defaultVisible: true },
    zip:             { defaultVisible: true },
    town:            { defaultVisible: true },
    countryCode:     { defaultVisible: true },
    phone:           { defaultVisible: true },
    email:           { defaultVisible: true },
    url:             { defaultVisible: true },
    siren:           { defaultVisible: true },
    siret:           { defaultVisible: true },
    tvaIntra:        { defaultVisible: true },
};
