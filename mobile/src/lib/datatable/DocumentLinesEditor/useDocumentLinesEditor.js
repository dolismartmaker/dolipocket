import { useState } from "react";

import { useConfirm } from "@cap-rel/smartcommon";

// useDocumentLinesEditor()
//
// Shared business logic for the 5 document line editors
// (Proposal / Order / Invoice / SupplierOrder / SupplierInvoice).
//
// Pure CRUD + reorder + busy/error state -- zero JSX, zero viewport
// awareness. Consumed by the desktop <DocumentLinesEditor> (inline
// table) and the mobile <DocumentLinesEditorMobile> (stacked cards +
// bottom sheet form) so both share validation, error logging and
// totals refresh semantics.
//
// Arguments:
//   docId         current document id (Number). When falsy, all
//                 mutators are no-ops.
//   lines         the current array of lines (from the parent state).
//   dataSource    a useDb<Feature>() hook exposing addLine/updateLine/
//                 deleteLine/get.
//   onChange      callback fired after every successful mutation with
//                 the refreshed document object so the parent page can
//                 update its local copy.
//   readOnly      when true, action mutators short-circuit -- used by
//                 callers to disable edits when the document is no
//                 longer in draft state.
//
// Returns:
//   { busy, error, clearError,
//     addLine(payload),
//     updateLine(lineId, patch),
//     deleteLine(lineId, { skipConfirm }?),
//     moveLine(lineId, "up" | "down"),
//   }
export const useDocumentLinesEditor = ({ docId, lines, dataSource, onChange, readOnly = false }) => {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const { confirm } = useConfirm();

    const safeLines = Array.isArray(lines) ? lines : [];

    const clearError = () => setError(null);

    const addLine = async (payload) => {
        if (!docId || readOnly) {
            console.error("[useDocumentLinesEditor] addLine skipped: docId missing or readOnly");
            return null;
        }
        setBusy(true);
        setError(null);
        try {
            const updated = await dataSource.addLine(docId, payload);
            if (updated && typeof onChange === "function") onChange(updated);
            return updated;
        } catch (err) {
            console.error("[useDocumentLinesEditor] addLine failed", err);
            setError("Impossible d'ajouter la ligne.");
            return null;
        } finally {
            setBusy(false);
        }
    };

    const updateLine = async (lineId, patch) => {
        if (!docId || !lineId || readOnly) {
            console.error("[useDocumentLinesEditor] updateLine skipped", { docId, lineId, readOnly });
            return null;
        }
        setBusy(true);
        setError(null);
        try {
            const updated = await dataSource.updateLine(docId, lineId, patch);
            if (updated && typeof onChange === "function") onChange(updated);
            return updated;
        } catch (err) {
            console.error("[useDocumentLinesEditor] updateLine failed", err);
            setError("Impossible de mettre à jour la ligne.");
            return null;
        } finally {
            setBusy(false);
        }
    };

    const deleteLine = async (lineId, { skipConfirm = false } = {}) => {
        if (!docId || !lineId || readOnly) {
            console.error("[useDocumentLinesEditor] deleteLine skipped", { docId, lineId, readOnly });
            return null;
        }
        if (!skipConfirm) {
            const ok = await confirm({
                type: "delete",
                title: "Supprimer cette ligne ?",
                message: "Cette ligne sera définitivement supprimée du document.",
                confirmText: "Supprimer",
                cancelText: "Annuler",
            });
            if (!ok) return null;
        }
        setBusy(true);
        setError(null);
        try {
            await dataSource.deleteLine(docId, lineId);
            // Some stores return void on delete; ask the store for the
            // refreshed doc so the parent state has up-to-date totals.
            const refreshed = typeof dataSource.get === "function"
                ? await dataSource.get(docId)
                : null;
            if (refreshed && typeof onChange === "function") onChange(refreshed);
            return refreshed;
        } catch (err) {
            console.error("[useDocumentLinesEditor] deleteLine failed", err);
            setError("Impossible de supprimer la ligne.");
            return null;
        } finally {
            setBusy(false);
        }
    };

    const moveLine = async (lineId, direction) => {
        if (!docId || !lineId || readOnly) {
            console.error("[useDocumentLinesEditor] moveLine skipped", { docId, lineId, readOnly });
            return null;
        }
        const idx = safeLines.findIndex((l) => Number(l.id ?? l.rowid) === Number(lineId));
        if (idx < 0) {
            console.error("[useDocumentLinesEditor] moveLine: line not found", { lineId, lines: safeLines });
            return null;
        }
        const targetIdx = direction === "up" ? idx - 1 : idx + 1;
        if (targetIdx < 0 || targetIdx >= safeLines.length) return null;
        const targetRang = Number(safeLines[targetIdx].rang ?? targetIdx + 1);
        return updateLine(lineId, { rang: targetRang });
    };

    return {
        busy,
        error,
        clearError,
        addLine,
        updateLine,
        deleteLine,
        moveLine,
    };
};

// Helpers reused by both desktop and mobile renderers. Kept in the
// hook module so the two UI variants stay in sync with the same
// number formatting + totals computation.

export const formatAmount = (val) => {
    const n = Number(val ?? 0);
    if (!Number.isFinite(n)) return "0,00";
    return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const computeLineTotalHt = (line) => {
    const qty = Number(line?.qty ?? 0);
    const subprice = Number(line?.subprice ?? 0);
    const remise = Number(line?.remisePercent ?? line?.remise_percent ?? 0);
    const total = qty * subprice * (1 - remise / 100);
    return Number.isFinite(total) ? total : 0;
};

// Build the payload sent to addLine() for a "ligne libre" -- the user
// types the description + qty/subprice/tva/remise/type by hand.
// Centralized so desktop and mobile produce strictly the same JSON.
export const buildFreeLinePayload = ({ description, qty, subprice, tvaTx, remise, productType }) => {
    const trimmed = String(description || "").trim();
    if (!trimmed) return null;
    return {
        label: trimmed,
        description: trimmed,
        qty: Number(qty || 1),
        subprice: Number(subprice || 0),
        tva_tx: Number(tvaTx || 0),
        remise_percent: Number(remise || 0),
        product_type: Number(productType || 0),
    };
};

// Build the payload sent to addLine() for a "ligne produit/service" --
// the user picks an existing product, the backend auto-hydrates
// description/subprice/tva_tx/type. We still let them tweak qty/remise
// and optionally override the description before submit.
export const buildProductLinePayload = ({ productId, qty, remise, overrideDesc }) => {
    if (!productId || productId <= 0) return null;
    const payload = {
        fk_product: Number(productId),
        qty: Number(qty || 1),
        remise_percent: Number(remise || 0),
    };
    const trimmed = String(overrideDesc || "").trim();
    if (trimmed !== "") {
        payload.description = trimmed;
        payload.label = trimmed;
    }
    return payload;
};

// =====================================================================
// Lot 11 -- section lines (titles + sub-totals).
//
// Dolibarr does not have a first-class concept of "title" / "sub-total"
// for line collections, but the community convention is:
//
//   * product_type = 9 marks a line as non-billable (PDF templates skip
//     calculations on it and render the description full-width).
//   * special_code = 0 (with product_type=9) -> title bar.
//   * special_code = 104 (with product_type=9) -> sub-total marker
//     (compatible with the community 'linesubtotal' module that ships a
//     dedicated PDF block).
//
// We persist these lines with qty=1 (not 0) because Propal::addline has
// a side-effect that overrides special_code with 3 ("option" tag) when
// qty is empty. qty=1 keeps the line in the standard branch; the visual
// outcome is identical thanks to product_type=9.
// =====================================================================

export const SECTION_PRODUCT_TYPE = 9;
export const TITLE_SPECIAL_CODE = 0;
export const SUBTOTAL_SPECIAL_CODE = 104;

// Returns true when a line is a section marker (title or sub-total). The
// discriminator is product_type=9 regardless of special_code, so PDF
// templates and the front renderer agree on what should be drawn as a
// section bar rather than a billable row.
export const isSectionLine = (line) => Number(line?.productType ?? line?.product_type) === SECTION_PRODUCT_TYPE;

export const isTitleLine = (line) =>
    isSectionLine(line) && Number(line?.specialCode ?? line?.special_code ?? 0) !== SUBTOTAL_SPECIAL_CODE;

export const isSubtotalLine = (line) =>
    isSectionLine(line) && Number(line?.specialCode ?? line?.special_code ?? 0) === SUBTOTAL_SPECIAL_CODE;

// Build the payload sent to addLine() for a section line (title or
// sub-total). `kind` is either "title" or "subtotal". `label` is the
// description displayed in the bar. qty/subprice/tva_tx are forced to
// neutral values so no money is ever computed by the line totals.
export const buildSectionLinePayload = ({ kind, label }) => {
    const trimmed = String(label || "").trim();
    if (!trimmed) return null;
    const specialCode = kind === "subtotal" ? SUBTOTAL_SPECIAL_CODE : TITLE_SPECIAL_CODE;
    return {
        label: trimmed,
        description: trimmed,
        // qty=1 -- see comment block above for the Propal quirk reason.
        qty: 1,
        subprice: 0,
        tva_tx: 0,
        remise_percent: 0,
        product_type: SECTION_PRODUCT_TYPE,
        special_code: specialCode,
    };
};

// Compute the sub-total displayed for each subtotal line. Iterates the
// lines top-to-bottom and accumulates total_ht / total_ttc on regular
// billable lines (product_type != 9). When we hit a subtotal marker we
// snapshot the running sums and reset the accumulator so the next
// section starts fresh.
//
// Returns a Map keyed by line id pointing to {ht, ttc} for every
// subtotal line. Lines that are not subtotals are absent from the map.
export const computeSubtotals = (lines) => {
    const safe = Array.isArray(lines) ? lines : [];
    const out = new Map();
    let ht = 0;
    let ttc = 0;
    for (const line of safe) {
        if (isSubtotalLine(line)) {
            const key = line.id ?? line.rowid;
            if (key !== undefined && key !== null) {
                out.set(Number(key), { ht, ttc });
            }
            ht = 0;
            ttc = 0;
            continue;
        }
        // Skip titles (they have product_type=9 but special_code != 104);
        // they do not contribute to a sub-total.
        if (isSectionLine(line)) continue;
        // Prefer server-computed totals (backend has the authoritative
        // rounding); fall back to a local computeLineTotalHt if absent.
        const lineHt = Number(line?.totalHt);
        const lineTtc = Number(line?.totalTtc);
        if (Number.isFinite(lineHt)) {
            ht += lineHt;
        } else {
            ht += computeLineTotalHt(line);
        }
        if (Number.isFinite(lineTtc)) {
            ttc += lineTtc;
        }
    }
    return out;
};
