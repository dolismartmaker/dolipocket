import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useDbThirdParties } from "src/db/stores/thirdparties/useDbThirdParties";
import { useMenu } from "src/lib/permissions";
import {
    MasterDetailLayout,
    EmptyDetail,
    TouchList,
    TouchListItem,
    DocumentDetailPane,
} from "src/lib/tablet";
import { HEADER_OVERRIDES } from "src/lib/cockpit/headerOverrides";

// Tablet master-detail workspace for ThirdParties. Used by BOTH:
//   - /thirdparties        (list route, no preselection)
//   - /thirdparties/:id    (detail route, preselects via initialId)
// The selection lives in component state (not the URL), so tapping a row
// updates the right pane in place without remounting the list.

const renderItem = (tp) => (
    <TouchListItem
        primary={tp.name}
        secondary={[tp.town, tp.email].filter(Boolean).join(" - ")}
        badge={tp.client ? "Client" : (tp.fournisseur ? "Fournisseur" : null)}
    />
);

export const ThirdPartiesWorkspace = ({ initialId = null }) => {
    const navigate = useNavigate();
    const db = useDbThirdParties();
    const { has } = useMenu();

    const [selectedId, setSelectedId] = useState(initialId);
    const [reloadToken, setReloadToken] = useState(0);

    const load = useCallback(
        ({ q }) => db.list({ q, perPage: 200 }),
        [db],
    );

    return (
        <MasterDetailLayout
            master={
                <TouchList
                    title="Tiers"
                    searchPlaceholder="Rechercher un tiers..."
                    load={load}
                    reloadToken={reloadToken}
                    getKey={(tp) => tp.id}
                    renderItem={renderItem}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    onNew={has("thirdparty.create") ? () => navigate("/thirdparties/new") : null}
                />
            }
            detail={
                selectedId ? (
                    <DocumentDetailPane
                        key={selectedId}
                        id={selectedId}
                        db={db}
                        feature="thirdparty"
                        storageKey="dolipocket.thirdparty.tablet.header"
                        title="Fiche tiers"
                        renderTitle={(o) => o.name}
                        headerOverrides={HEADER_OVERRIDES}
                        onEdit={has("thirdparty.write")
                            ? () => navigate(`/thirdparties/${selectedId}/edit`)
                            : null}
                        onDeleted={() => {
                            setSelectedId(null);
                            setReloadToken((t) => t + 1);
                        }}
                    />
                ) : (
                    <EmptyDetail label="Sélectionnez un tiers" hint="Choisissez un tiers dans la liste pour voir sa fiche." />
                )
            }
        />
    );
};
