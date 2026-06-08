import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useDbWarehouses } from "src/db/stores/warehouses/useDbWarehouses";
import { useMenu } from "src/lib/permissions";
import {
    MasterDetailLayout,
    EmptyDetail,
    TouchList,
    TouchListItem,
    DocumentDetailPane,
} from "src/lib/tablet";
import { HEADER_OVERRIDES } from "../WarehousePage/WarehousePage.desktop";

// Tablet master-detail workspace for Warehouses. Used by BOTH:
//   - /warehouses        (list route, no preselection)
//   - /warehouses/:id    (detail route, preselects via initialId)
// The selection lives in component state (not the URL), so tapping a row
// updates the right pane in place without remounting the list.

const renderItem = (wh) => (
    <TouchListItem
        primary={wh.label || wh.ref}
        secondary={[wh.lieu, [wh.zip, wh.town].filter(Boolean).join(" ")].filter(Boolean).join(" - ")}
        badge={Number(wh.statut) !== 1 ? "Fermé" : null}
    />
);

export const WarehousesWorkspace = ({ initialId = null }) => {
    const navigate = useNavigate();
    const db = useDbWarehouses();
    const { has } = useMenu();

    const [selectedId, setSelectedId] = useState(initialId);
    const [reloadToken, setReloadToken] = useState(0);

    // No perPage: that would map to `limit` and force the paginated backend
    // branch which ignores `q`. Without it, the request hits indexLegacy which
    // performs a real server-side search on q.
    const load = useCallback(({ q }) => db.list({ q }), [db]);

    return (
        <MasterDetailLayout
            master={
                <TouchList
                    title="Entrepôts"
                    searchPlaceholder="Rechercher un entrepôt..."
                    load={load}
                    reloadToken={reloadToken}
                    getKey={(wh) => wh.id}
                    renderItem={renderItem}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    onNew={has("warehouse.create") ? () => navigate("/warehouses/new") : null}
                />
            }
            detail={
                selectedId ? (
                    <DocumentDetailPane
                        key={selectedId}
                        id={selectedId}
                        db={db}
                        feature="warehouse"
                        storageKey="dolipocket.warehouse.tablet.header"
                        title="Fiche entrepôt"
                        renderTitle={(o) => o.label || o.ref}
                        headerOverrides={HEADER_OVERRIDES}
                        onEdit={has("warehouse.write")
                            ? () => navigate(`/warehouses/${selectedId}/edit`)
                            : null}
                        onDeleted={() => {
                            setSelectedId(null);
                            setReloadToken((t) => t + 1);
                        }}
                    />
                ) : (
                    <EmptyDetail label="Sélectionnez un entrepôt" hint="Choisissez un entrepôt dans la liste pour voir sa fiche." />
                )
            }
        />
    );
};
