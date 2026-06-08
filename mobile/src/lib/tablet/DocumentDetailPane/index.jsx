import { useEffect, useMemo, useState } from "react";
import { FaPen, FaTrash } from "react-icons/fa6";

import { useConfirm } from "@cap-rel/smartcommon";

import { DocumentHeaderFields } from "src/lib/datatable/DocumentHeaderFields";
import { StatusPill } from "src/lib/components/StatusPill";

// Generic detail pane for the tablet master-detail layout. Loads a single
// record by explicit `id` prop (NOT useParams, since the selection is in-pane,
// not route-driven) and renders:
//   - a touch header: title + optional StatusPill + action buttons (>=44px,
//     no "Back" button - the list is already on the left)
//   - the catalogue-driven <DocumentHeaderFields> (reused as-is)
//   - an optional `renderExtra(object)` block (lines / totals / notes for the
//     5 document features)
//
// Built-in Edit + Delete; extra workflow actions via the `actions` prop.
//
//   <DocumentDetailPane
//       id={selectedId}
//       db={dbThirdParties}              // must expose get(id) [+ remove(id)]
//       feature="thirdparty"             // catalog namespace
//       storageKey="dolipocket.thirdparty.tablet.header"
//       renderTitle={(o) => o.name}
//       headerOverrides={HEADER_OVERRIDES}
//       statusFeature="proposal"         // optional, enables StatusPill
//       statusOf={(o) => o.fkStatut}     // optional accessor
//       onEdit={() => navigate(...)}     // null hides Edit
//       onDeleted={() => setSelectedId(null)}
//       actions={[{ key, label, icon, onClick, primary, danger, disabled }]}
//       renderExtra={(object) => <>...</>}
//   />

const HEADER_BTN =
    "h-11 px-3.5 rounded-lg text-sm font-medium flex items-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50 disabled:active:scale-100";

export const DocumentDetailPane = ({
    id,
    db,
    feature,
    storageKey,
    title = "Fiche",
    renderTitle,
    headerOverrides,
    statusFeature,
    statusOf,
    paidOf,
    onEdit,
    onDeleted,
    actions,
    renderExtra,
    headerTitle = "Informations",
}) => {
    const { confirm } = useConfirm() ?? {};

    const [object, setObject] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        if (!id || !db?.get) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        Promise.resolve(db.get(id))
            .then((data) => { if (!cancelled) setObject(data); })
            .catch((err) => {
                if (cancelled) return;
                console.error("[DocumentDetailPane] get error", feature, id, err);
                setError(err?.response?.status === 404 ? "Introuvable" : "Erreur de chargement");
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, db]);

    const dataSource = useMemo(() => ({
        columns: (opts) => db?.columns?.(opts) ?? Promise.resolve([]),
    }), [db]);

    const handleDelete = async () => {
        if (!db?.remove) return;
        const ok = confirm
            ? await confirm({
                  type: "delete",
                  title: "Supprimer cet élément ?",
                  message: "Cette action est irréversible.",
                  confirmText: "Supprimer",
                  cancelText: "Annuler",
              })
            : window.confirm("Supprimer cet élément ?");
        if (!ok) return;
        setDeleting(true);
        try {
            await db.remove(id);
            onDeleted?.();
        } catch (err) {
            console.error("[DocumentDetailPane] remove error", feature, id, err);
            setError("Suppression impossible");
            setDeleting(false);
        }
    };

    if (loading) {
        return <div className="h-full flex items-center justify-center text-sm text-soft-text">Chargement...</div>;
    }
    if (error) {
        return <div className="h-full flex items-center justify-center text-sm text-red-600">{error}</div>;
    }
    if (!object) {
        return <div className="h-full flex items-center justify-center text-sm text-soft-text">Aucune donnée</div>;
    }

    const computedTitle = typeof renderTitle === "function" ? (renderTitle(object) || title) : title;
    const showStatus = statusFeature && typeof statusOf === "function";

    return (
        <div className="min-h-full bg-medium-bg">
            {/* Sticky touch header */}
            <header className="sticky top-0 z-10 bg-white border-b border-soft-border px-4 py-2.5 flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <h1 className="text-base font-bold text-strong-text truncate">{computedTitle}</h1>
                    {showStatus && (
                        <StatusPill
                            feature={statusFeature}
                            status={statusOf(object)}
                            paid={typeof paidOf === "function" ? paidOf(object) : undefined}
                        />
                    )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {Array.isArray(actions) && actions.map((a) => {
                        const Icon = a.icon;
                        return (
                            <button
                                key={a.key}
                                type="button"
                                onClick={a.onClick}
                                disabled={a.disabled}
                                className={`${HEADER_BTN} ${
                                    a.primary
                                        ? "bg-primary text-white"
                                        : a.danger
                                            ? "bg-white border border-red-200 text-red-600"
                                            : "bg-white border border-soft-border text-strong-text"
                                }`}
                            >
                                {Icon && <Icon className="text-sm" />}
                                <span>{a.label}</span>
                            </button>
                        );
                    })}
                    {typeof onEdit === "function" && (
                        <button type="button" onClick={onEdit} className={`${HEADER_BTN} bg-primary text-white`}>
                            <FaPen className="text-sm" />
                            <span>Modifier</span>
                        </button>
                    )}
                    {db?.remove && (
                        <button
                            type="button"
                            onClick={handleDelete}
                            disabled={deleting}
                            className={`${HEADER_BTN} bg-white border border-red-200 text-red-600`}
                        >
                            <FaTrash className="text-sm" />
                            <span>{deleting ? "..." : "Supprimer"}</span>
                        </button>
                    )}
                </div>
            </header>

            {/* Body */}
            <div className="p-4 space-y-4 max-w-5xl">
                <DocumentHeaderFields
                    object={object}
                    feature={feature}
                    dataSource={dataSource}
                    storageKey={storageKey}
                    title={headerTitle}
                    overrides={headerOverrides}
                />
                {typeof renderExtra === "function" && renderExtra(object)}
            </div>
        </div>
    );
};
