import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useDbProducts } from "src/db/stores/products/useDbProducts";
import { useMenu } from "src/lib/permissions";
import {
    MasterDetailLayout,
    EmptyDetail,
    TouchList,
    TouchListItem,
    DocumentDetailPane,
} from "src/lib/tablet";
import { HEADER_OVERRIDES } from "../ProductPage/ProductPage.desktop";

// Tablet master-detail workspace for Products. Used by BOTH:
//   - /products        (list route, no preselection)
//   - /products/:id    (detail route, preselects via initialId)
// The selection lives in component state (not the URL), so tapping a row
// updates the right pane in place without remounting the list.

const formatPrice = (value) =>
    `${Number(value ?? 0).toLocaleString("fr-FR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })} EUR`;

const renderItem = (p) => (
    <TouchListItem
        primary={p.label}
        secondary={[p.ref, p.barcode].filter(Boolean).join(" - ")}
        amount={formatPrice(p.price)}
        badge={p.type === 1 ? "Service" : "Produit"}
    />
);

export const ProductsWorkspace = ({ initialId = null }) => {
    const navigate = useNavigate();
    const db = useDbProducts();
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
                    title="Produits et services"
                    searchPlaceholder="Rechercher un produit..."
                    load={load}
                    reloadToken={reloadToken}
                    getKey={(p) => p.id}
                    renderItem={renderItem}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    onNew={has("product.create") ? () => navigate("/products/new") : null}
                />
            }
            detail={
                selectedId ? (
                    <DocumentDetailPane
                        key={selectedId}
                        id={selectedId}
                        db={db}
                        feature="product"
                        storageKey="dolipocket.product.tablet.header"
                        title="Fiche produit"
                        renderTitle={(o) => o.label || o.ref}
                        headerOverrides={HEADER_OVERRIDES}
                        onEdit={has("product.write")
                            ? () => navigate(`/products/${selectedId}/edit`)
                            : null}
                        onDeleted={() => {
                            setSelectedId(null);
                            setReloadToken((t) => t + 1);
                        }}
                    />
                ) : (
                    <EmptyDetail label="Sélectionnez un produit" hint="Choisissez un produit dans la liste pour voir sa fiche." />
                )
            }
        />
    );
};
