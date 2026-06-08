import { useMemo, useState } from "react";
import { FaPlus, FaTrash, FaArrowUp, FaArrowDown, FaPenToSquare, FaHeading } from "react-icons/fa6";

import {
    useDocumentLinesEditor,
    formatAmount,
    computeLineTotalHt,
    computeSubtotals,
    isSectionLine,
    isSubtotalLine,
} from "./useDocumentLinesEditor";
import { LineFormMobile } from "./LineFormMobile";

// <DocumentLinesEditorMobile>
//
// Mobile renderer for the document lines editor. Stacked cards layout
// (one card per line) with a sticky-ish "Ajouter ligne" footer that
// expands into two choices (libre / produit). Edit / delete / move
// actions are exposed inline on each card -- big enough for finger tap
// (~44px hit target). All actual mutations go through the shared
// useDocumentLinesEditor() hook, exactly like the desktop variant.
//
// UI: mobile-relaxed (rounded-xl, shadow allowed via the form sheet,
// touch feedback via active:bg-*). Cards are bordered, no shadow.
export const DocumentLinesEditorMobile = ({ docId, lines, dataSource, onChange, readOnly = false }) => {
    // null | "free" | "product" | "section" | { mode: "edit", lineId, line }
    const [sheet, setSheet] = useState(null);

    const safeLines = Array.isArray(lines) ? lines : [];

    // Sub-totals for sub-total marker lines (Lot 11).
    const subtotals = useMemo(() => computeSubtotals(safeLines), [safeLines]);

    const {
        busy, error, clearError,
        addLine, updateLine, deleteLine, moveLine,
    } = useDocumentLinesEditor({ docId, lines, dataSource, onChange, readOnly });

    const openFree = () => { clearError(); setSheet({ mode: "free" }); };
    const openProduct = () => { clearError(); setSheet({ mode: "product" }); };
    const openSection = () => { clearError(); setSheet({ mode: "section" }); };
    const openEdit = (line) => {
        clearError();
        // Section lines route to the section sheet so the user only
        // touches label + kind, not qty/subprice/TVA.
        if (isSectionLine(line)) {
            setSheet({ mode: "editSection", lineId: line.id ?? line.rowid, line });
            return;
        }
        setSheet({ mode: "edit", lineId: line.id ?? line.rowid, line });
    };
    const closeSheet = () => setSheet(null);

    const handleAddSubmit = async (payload) => {
        const updated = await addLine(payload);
        if (updated) closeSheet();
    };

    const handleEditSubmit = async (patch) => {
        if (!sheet?.lineId) return;
        const updated = await updateLine(sheet.lineId, patch);
        if (updated) closeSheet();
    };

    return (
        <section className="rounded-xl border border-soft-border bg-white overflow-hidden">
            <header className="px-4 py-3 border-b border-soft-border flex items-center gap-2">
                <h2 className="text-base font-semibold text-strong-text flex-1">
                    Lignes ({safeLines.length})
                </h2>
            </header>

            {error ? (
                <div className="px-4 py-2 border-b border-red-200 bg-red-50 text-sm text-red-700 flex items-start justify-between gap-3">
                    <span>{error}</span>
                    <button
                        type="button"
                        onClick={clearError}
                        className="text-red-700 underline text-xs shrink-0"
                    >
                        OK
                    </button>
                </div>
            ) : null}

            {safeLines.length === 0 ? (
                <div className="px-4 py-6 text-sm text-soft-text italic text-center">
                    {docId
                        ? "Aucune ligne. Appuie sur +Ligne pour en ajouter."
                        : "Enregistre d'abord le document pour pouvoir ajouter des lignes."}
                </div>
            ) : (
                <ul className="divide-y divide-soft-border/60">
                    {safeLines.map((line, idx) => {
                        const lineId = line.id ?? line.rowid;
                        if (isSectionLine(line)) {
                            return (
                                <SectionCard
                                    key={lineId ?? idx}
                                    line={line}
                                    idx={idx}
                                    readOnly={readOnly}
                                    busy={busy}
                                    subtotal={isSubtotalLine(line) ? subtotals.get(Number(lineId)) : null}
                                    onEdit={() => openEdit(line)}
                                    onDelete={() => deleteLine(lineId)}
                                    onMoveUp={idx > 0 ? () => moveLine(lineId, "up") : null}
                                    onMoveDown={idx < safeLines.length - 1 ? () => moveLine(lineId, "down") : null}
                                />
                            );
                        }
                        return (
                            <LineCard
                                key={lineId ?? idx}
                                line={line}
                                idx={idx}
                                readOnly={readOnly}
                                busy={busy}
                                onEdit={() => openEdit(line)}
                                onDelete={() => deleteLine(lineId)}
                                onMoveUp={idx > 0 ? () => moveLine(lineId, "up") : null}
                                onMoveDown={idx < safeLines.length - 1 ? () => moveLine(lineId, "down") : null}
                            />
                        );
                    })}
                </ul>
            )}

            {!readOnly && docId ? (
                <div className="border-t border-soft-border bg-soft-bg/50 p-3 grid grid-cols-3 gap-2">
                    <button
                        type="button"
                        onClick={openSection}
                        disabled={busy}
                        className="flex items-center justify-center gap-1.5 py-3 rounded-lg border border-soft-border bg-white text-strong-text font-medium text-sm active:bg-medium-bg/50 disabled:opacity-60"
                    >
                        <FaHeading className="text-xs" /> Titre / S.-total
                    </button>
                    <button
                        type="button"
                        onClick={openFree}
                        disabled={busy}
                        className="flex items-center justify-center gap-1.5 py-3 rounded-lg border border-soft-border bg-white text-strong-text font-medium text-sm active:bg-medium-bg/50 disabled:opacity-60"
                    >
                        <FaPlus className="text-xs" /> Libre
                    </button>
                    <button
                        type="button"
                        onClick={openProduct}
                        disabled={busy}
                        className="flex items-center justify-center gap-1.5 py-3 rounded-lg bg-primary text-white font-medium text-sm active:brightness-90 disabled:opacity-60"
                    >
                        <FaPlus className="text-xs" /> Produit
                    </button>
                </div>
            ) : null}

            {sheet?.mode === "free" || sheet?.mode === "product" || sheet?.mode === "section" ? (
                <LineFormMobile
                    mode={sheet.mode}
                    onSubmit={handleAddSubmit}
                    onClose={closeSheet}
                    busy={busy}
                />
            ) : null}

            {sheet?.mode === "edit" ? (
                <LineFormMobile
                    mode="edit"
                    line={sheet.line}
                    onSubmit={handleEditSubmit}
                    onClose={closeSheet}
                    busy={busy}
                />
            ) : null}

            {sheet?.mode === "editSection" ? (
                <LineFormMobile
                    mode="editSection"
                    line={sheet.line}
                    onSubmit={handleEditSubmit}
                    onClose={closeSheet}
                    busy={busy}
                />
            ) : null}
        </section>
    );
};

// Section marker card (title or sub-total). Visually distinct from a
// regular line: emerald-tinted background for titles, gray-tinted for
// sub-totals, with the computed amount on the right when relevant.
const SectionCard = ({ line, idx, readOnly, busy, subtotal, onEdit, onDelete, onMoveUp, onMoveDown }) => {
    const isSubtotal = isSubtotalLine(line);
    const label = String(line?.label || line?.description || "").trim()
        || (isSubtotal ? "(Sous-total)" : "(Titre)");
    const bg = isSubtotal ? "bg-medium-bg/60" : "bg-emerald-50/70";
    const borderL = isSubtotal ? "border-l-4 border-l-soft-border" : "border-l-4 border-l-emerald-400";

    return (
        <li className={`px-4 py-3 flex flex-col gap-2 ${bg} ${borderL}`}>
            <div
                className={`flex items-start justify-between gap-3 ${readOnly ? "" : "active:opacity-70"}`}
                onClick={readOnly ? undefined : onEdit}
                role={readOnly ? undefined : "button"}
                tabIndex={readOnly ? undefined : 0}
            >
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-soft-text shrink-0">#{idx + 1}</span>
                        <span className="font-semibold text-strong-text break-words">
                            {isSubtotal ? "Sous-total: " : ""}{label}
                        </span>
                    </div>
                </div>
                {isSubtotal && subtotal ? (
                    <div className="text-right shrink-0">
                        <div className="font-semibold text-strong-text tabular-nums">{formatAmount(subtotal.ht)}</div>
                        <div className="text-xs text-soft-text">EUR HT</div>
                    </div>
                ) : null}
            </div>
            {!readOnly ? (
                <div className="flex items-center justify-end gap-1 -mr-1">
                    {onMoveUp ? (
                        <button type="button" onClick={onMoveUp} disabled={busy} aria-label="Monter" className="p-2 text-soft-text active:text-strong-text disabled:opacity-50">
                            <FaArrowUp />
                        </button>
                    ) : null}
                    {onMoveDown ? (
                        <button type="button" onClick={onMoveDown} disabled={busy} aria-label="Descendre" className="p-2 text-soft-text active:text-strong-text disabled:opacity-50">
                            <FaArrowDown />
                        </button>
                    ) : null}
                    <button type="button" onClick={onEdit} disabled={busy} aria-label="Modifier" className="p-2 text-soft-text active:text-primary disabled:opacity-50">
                        <FaPenToSquare />
                    </button>
                    <button type="button" onClick={onDelete} disabled={busy} aria-label="Supprimer" className="p-2 text-soft-text active:text-red-600 disabled:opacity-50">
                        <FaTrash />
                    </button>
                </div>
            ) : null}
        </li>
    );
};

// One line rendered as a card on mobile. Description + qty x PU summary
// on top, total on the right, action bar at the bottom (move/edit/
// delete) hidden when readOnly. Tapping the card body opens the edit
// sheet for convenience.
const LineCard = ({ line, idx, readOnly, busy, onEdit, onDelete, onMoveUp, onMoveDown }) => {
    const desc = String(line.label || line.description || "").trim() || "(sans description)";
    const totalHt = computeLineTotalHt(line);
    const tva = Number(line.tvaTx ?? line.tva_tx ?? 0);
    const remise = Number(line.remisePercent ?? line.remise_percent ?? 0);

    return (
        <li className="px-4 py-3 flex flex-col gap-2">
            <div
                className={`flex items-start justify-between gap-3 ${readOnly ? "" : "active:opacity-70"}`}
                onClick={readOnly ? undefined : onEdit}
                role={readOnly ? undefined : "button"}
                tabIndex={readOnly ? undefined : 0}
            >
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-soft-text shrink-0">#{idx + 1}</span>
                        <span className="font-medium text-strong-text break-words">{desc}</span>
                    </div>
                    <div className="text-sm text-soft-text mt-0.5">
                        {Number(line.qty ?? 0)} x {formatAmount(line.subprice)} EUR
                        {tva ? <span className="ml-1">- TVA {formatAmount(tva)} %</span> : null}
                        {remise ? <span className="ml-1">- Rem. {formatAmount(remise)} %</span> : null}
                    </div>
                    {line.fkProduct || line.fk_product ? (
                        <div className="text-xs text-soft-text">Produit #{line.fkProduct || line.fk_product}</div>
                    ) : null}
                </div>
                <div className="text-right shrink-0">
                    <div className="font-semibold text-strong-text tabular-nums">{formatAmount(totalHt)}</div>
                    <div className="text-xs text-soft-text">EUR HT</div>
                </div>
            </div>

            {!readOnly ? (
                <div className="flex items-center justify-end gap-1 -mr-1">
                    {onMoveUp ? (
                        <button
                            type="button"
                            onClick={onMoveUp}
                            disabled={busy}
                            aria-label="Monter"
                            className="p-2 text-soft-text active:text-strong-text disabled:opacity-50"
                        >
                            <FaArrowUp />
                        </button>
                    ) : null}
                    {onMoveDown ? (
                        <button
                            type="button"
                            onClick={onMoveDown}
                            disabled={busy}
                            aria-label="Descendre"
                            className="p-2 text-soft-text active:text-strong-text disabled:opacity-50"
                        >
                            <FaArrowDown />
                        </button>
                    ) : null}
                    <button
                        type="button"
                        onClick={onEdit}
                        disabled={busy}
                        aria-label="Modifier"
                        className="p-2 text-soft-text active:text-primary disabled:opacity-50"
                    >
                        <FaPenToSquare />
                    </button>
                    <button
                        type="button"
                        onClick={onDelete}
                        disabled={busy}
                        aria-label="Supprimer"
                        className="p-2 text-soft-text active:text-red-600 disabled:opacity-50"
                    >
                        <FaTrash />
                    </button>
                </div>
            ) : null}
        </li>
    );
};
