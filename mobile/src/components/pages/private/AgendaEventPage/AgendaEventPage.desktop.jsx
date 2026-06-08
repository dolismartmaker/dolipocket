import { FaArrowLeft, FaPen, FaTrash, FaCircleCheck } from "react-icons/fa6";

import { DocumentHeaderFields } from "src/lib/datatable";

// Desktop rendering of the agenda event detail page. Single-column centered
// layout (read-only document with header only -- no lines). Driven by the
// backend catalog (GET /event/columns) so any field added to dmAgenda is
// available via the "Champs" panel.
//
// Strict adherence to .claude/CLAUDE.md "Conventions UI desktop épurées" :
//   - bg-white rounded-xl border border-soft-border (no shadow)
//   - density tight (p-3/p-4 max)
//   - separators via border-b, never shadow
//   - hover:bg-medium-bg only, no transition-all, no hover:shadow-md
//   - no active:, no rounded-2xl, no gradient on cards.

// Format unix seconds to "DD/MM/YYYY HH:mm" in local timezone.
const formatTimestamp = (timestamp) => {
    const ts = Number(timestamp);
    if (!ts) return "-";
    const date = new Date(ts * 1000);
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yyyy = date.getFullYear();
    const hh = String(date.getHours()).padStart(2, "0");
    const mi = String(date.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
};

const HEADER_OVERRIDES = {
    label:          { defaultVisible: true },
    typeCode:       { defaultVisible: true },
    datep:          { defaultVisible: true, formatter: formatTimestamp },
    datef:          { defaultVisible: true, formatter: formatTimestamp },
    fulldayevent:   { defaultVisible: true, formatter: (v) => Number(v) > 0 ? "Oui" : "Non" },
    location:       { defaultVisible: true },
    note:           { defaultVisible: true },
    percentage:     { defaultVisible: true, formatter: (v) => `${Number(v ?? 0)} %` },
    fkUserAssigned: { defaultVisible: true, formatter: (v) => Number(v) > 0 ? `#${Number(v)}` : "-" },
    socid:          { defaultVisible: true, formatter: (v) => Number(v) > 0 ? `#${Number(v)}` : "-" },
    fkContact:      { defaultVisible: false, formatter: (v) => Number(v) > 0 ? `#${Number(v)}` : "-" },
    fkElement:      { defaultVisible: false },
    elementtype:    { defaultVisible: false },
    status:         { defaultVisible: false },
};

export const AgendaEventPageDesktop = (props) => {
    const {
        item, loading, error, actionPending,
        handleBack, handleEdit, handleDone, handleDelete,
        dataSource,
    } = props;

    const isDone = (item?.percentage ?? 0) >= 100;

    return (
        <div className="flex flex-col h-full w-full bg-medium-bg overflow-hidden">
            {/* Sticky top action bar */}
            <header className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-soft-border bg-white">
                <button
                    type="button"
                    onClick={handleBack}
                    className="p-1.5 -ml-1 rounded-md text-soft-text hover:bg-medium-bg hover:text-strong-text transition-colors"
                    aria-label="Retour à la liste"
                >
                    <FaArrowLeft className="text-sm" />
                </button>
                <h1 className="text-base font-bold text-strong-text truncate">
                    {loading ? "Chargement..." : (item?.label || "Évènement")}
                </h1>
                {item?.ref && (
                    <span className="text-[12px] text-soft-text truncate">{item.ref}</span>
                )}

                <span className="flex-1" />

                {!loading && item && (
                    <div className="flex items-center gap-2">
                        {!isDone && (
                            <button
                                type="button"
                                onClick={handleDone}
                                disabled={actionPending}
                                className="h-[28px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-white border border-soft-border text-green-700 hover:bg-green-50 hover:border-green-300 disabled:opacity-50 transition-colors"
                            >
                                <FaCircleCheck className="text-[11px]" />
                                <span>Terminer</span>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={handleEdit}
                            disabled={actionPending}
                            className="h-[28px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                        >
                            <FaPen className="text-[11px]" />
                            <span>Modifier</span>
                        </button>
                        <button
                            type="button"
                            onClick={handleDelete}
                            disabled={actionPending}
                            className="h-[28px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-white border border-soft-border text-red-600 hover:bg-red-50 hover:border-red-300 disabled:opacity-50 transition-colors"
                        >
                            <FaTrash className="text-[11px]" />
                            <span>Supprimer</span>
                        </button>
                    </div>
                )}
            </header>

            {error && (
                <div className="shrink-0 mx-4 mt-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm">
                    {error}
                </div>
            )}

            {/* Centered single-column body */}
            <div className="flex-1 min-h-0 overflow-auto px-4 py-4">
                {loading && (
                    <div className="text-center text-soft-text text-sm py-10">
                        Chargement...
                    </div>
                )}

                {!loading && item && (
                    <div className="max-w-[1200px] mx-auto space-y-3">
                        {isDone && (
                            <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded-md text-sm">
                                <FaCircleCheck />
                                <span className="font-medium">Évènement terminé</span>
                            </div>
                        )}
                        <DocumentHeaderFields
                            object={item}
                            feature="event"
                            dataSource={dataSource}
                            storageKey="dolipocket.agendaeventpage.header"
                            title="Informations"
                            overrides={HEADER_OVERRIDES}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};
