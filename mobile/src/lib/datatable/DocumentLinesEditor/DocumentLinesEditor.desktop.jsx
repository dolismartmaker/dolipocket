import { useEffect, useMemo, useState } from "react";
import { FaPlus, FaTrash, FaArrowUp, FaArrowDown, FaPenToSquare, FaHeading } from "react-icons/fa6";

import { Input, Textarea, Select } from "@cap-rel/smartcommon";
import { labelsWithFallback } from "src/utils";

import { FkPicker } from "src/lib/forms/FkPicker";

import {
    useDocumentLinesEditor,
    formatAmount,
    computeLineTotalHt,
    computeSubtotals,
    isSectionLine,
    isTitleLine,
    isSubtotalLine,
    buildFreeLinePayload,
    buildProductLinePayload,
    buildSectionLinePayload,
} from "./useDocumentLinesEditor";

// <DocumentLinesEditorDesktop>
//
// Desktop renderer (inline edit-in-place table) for the document lines
// editor. Wired against the shared useDocumentLinesEditor() hook so
// addLine/updateLine/deleteLine/moveLine logic is shared with the
// mobile variant. Pure presentational here.
//
// UI conventions desktop épurées (cf .claude/CLAUDE.md): pas de
// shadow-sm, pas de rounded-2xl, density tight, border-b inter-rows,
// hover:bg-gray-50.
export const DocumentLinesEditorDesktop = ({ docId, lines, dataSource, onChange, readOnly = false }) => {
    const [adding, setAdding] = useState(null); // null | "free" | "product" | "section"
    const [editingLineId, setEditingLineId] = useState(null);

    const safeLines = Array.isArray(lines) ? lines : [];

    // Precompute sub-total amounts for every subtotal marker line so the
    // table can render them as "Sub-total HT: 1 234,56" bars without
    // recalculating per row.
    const subtotals = useMemo(() => computeSubtotals(safeLines), [safeLines]);

    const {
        busy, error,
        addLine, updateLine, deleteLine, moveLine,
    } = useDocumentLinesEditor({ docId, lines, dataSource, onChange, readOnly });

    const handleSubmitNew = async (payload) => {
        const updated = await addLine(payload);
        if (updated) setAdding(null);
    };

    return (
        <section className="rounded-xl border border-soft-border bg-white overflow-hidden">
            <header className="px-4 py-2.5 border-b border-soft-border flex items-center gap-3">
                <h2 className="text-sm font-semibold text-strong-text flex-1">Lignes</h2>
                {!readOnly && docId ? (
                    <>
                        <button
                            type="button"
                            onClick={() => setAdding("section")}
                            disabled={busy}
                            className="inline-flex items-center gap-1.5 rounded-md border border-soft-border bg-white px-2.5 py-1 text-xs text-strong-text hover:bg-medium-bg/50 disabled:opacity-60"
                        >
                            <FaHeading className="text-[10px]" /> Titre / Sous-total
                        </button>
                        <button
                            type="button"
                            onClick={() => setAdding("free")}
                            disabled={busy}
                            className="inline-flex items-center gap-1.5 rounded-md border border-soft-border bg-white px-2.5 py-1 text-xs text-strong-text hover:bg-medium-bg/50 disabled:opacity-60"
                        >
                            <FaPlus className="text-[10px]" /> Ligne libre
                        </button>
                        <button
                            type="button"
                            onClick={() => setAdding("product")}
                            disabled={busy}
                            className="inline-flex items-center gap-1.5 rounded-md border border-primary bg-primary px-2.5 py-1 text-xs font-medium text-white hover:brightness-110 disabled:opacity-60"
                        >
                            <FaPlus className="text-[10px]" /> Produit / service
                        </button>
                    </>
                ) : null}
            </header>

            {error ? (
                <div className="px-4 py-2 border-b border-red-200 bg-red-50 text-sm text-red-700">
                    {error}
                </div>
            ) : null}

            {/* Table */}
            {safeLines.length === 0 ? (
                <div className="px-4 py-6 text-sm text-soft-text italic text-center">
                    {docId ? "Aucune ligne. Ajoute une ligne libre ou un produit." : "Enregistre d'abord le document pour pouvoir ajouter des lignes."}
                </div>
            ) : (
                <table className="w-full text-sm">
                    <thead className="bg-medium-bg/30 text-xs uppercase tracking-wide text-soft-text">
                        <tr>
                            <th className="text-left px-3 py-1.5 font-medium">#</th>
                            <th className="text-left px-3 py-1.5 font-medium">Description</th>
                            <th className="text-right px-3 py-1.5 font-medium w-20">Qté</th>
                            <th className="text-right px-3 py-1.5 font-medium w-28">PU HT</th>
                            <th className="text-right px-3 py-1.5 font-medium w-20">TVA %</th>
                            <th className="text-right px-3 py-1.5 font-medium w-20">Rem. %</th>
                            <th className="text-right px-3 py-1.5 font-medium w-28">Total HT</th>
                            {!readOnly ? <th className="text-right px-3 py-1.5 font-medium w-32">Actions</th> : null}
                        </tr>
                    </thead>
                    <tbody>
                        {safeLines.map((line, idx) => {
                            const lineId = line.id ?? line.rowid;
                            if (isSectionLine(line)) {
                                return (
                                    <SectionRow
                                        key={lineId ?? idx}
                                        line={line}
                                        idx={idx}
                                        readOnly={readOnly}
                                        editing={editingLineId === lineId}
                                        subtotal={isSubtotalLine(line) ? subtotals.get(Number(lineId)) : null}
                                        onStartEdit={() => setEditingLineId(lineId)}
                                        onCancelEdit={() => setEditingLineId(null)}
                                        onSave={async (patch) => {
                                            setEditingLineId(null);
                                            await updateLine(lineId, patch);
                                        }}
                                        onDelete={() => deleteLine(lineId)}
                                        onMoveUp={idx > 0 ? () => moveLine(lineId, "up") : null}
                                        onMoveDown={idx < safeLines.length - 1 ? () => moveLine(lineId, "down") : null}
                                    />
                                );
                            }
                            return (
                                <LineRow
                                    key={lineId ?? idx}
                                    line={line}
                                    idx={idx}
                                    readOnly={readOnly}
                                    editing={editingLineId === lineId}
                                    onStartEdit={() => setEditingLineId(lineId)}
                                    onCancelEdit={() => setEditingLineId(null)}
                                    onSave={async (patch) => {
                                        setEditingLineId(null);
                                        await updateLine(lineId, patch);
                                    }}
                                    onDelete={() => deleteLine(lineId)}
                                    onMoveUp={idx > 0 ? () => moveLine(lineId, "up") : null}
                                    onMoveDown={idx < safeLines.length - 1 ? () => moveLine(lineId, "down") : null}
                                />
                            );
                        })}
                    </tbody>
                </table>
            )}

            {adding === "free" ? (
                <AddFreeLineForm onSubmit={handleSubmitNew} onCancel={() => setAdding(null)} busy={busy} />
            ) : null}

            {adding === "product" ? (
                <AddProductLineForm onSubmit={handleSubmitNew} onCancel={() => setAdding(null)} busy={busy} />
            ) : null}

            {adding === "section" ? (
                <AddSectionLineForm onSubmit={handleSubmitNew} onCancel={() => setAdding(null)} busy={busy} />
            ) : null}
        </section>
    );
};

// Renders a section marker line (title or sub-total) as a full-width
// bar spanning all data columns. Title -> light-emerald background bold
// label. Sub-total -> light-gray background with the rolled-up amount
// aligned right. Actions remain available (move/edit/delete) when the
// document is editable.
const SectionRow = ({ line, idx, readOnly, editing, subtotal, onStartEdit, onCancelEdit, onSave, onDelete, onMoveUp, onMoveDown }) => {
    const [label, setLabel] = useState(String(line?.label || line?.description || ""));
    useEffect(() => {
        setLabel(String(line?.label || line?.description || ""));
    }, [line?.id, line?.rowid, line?.label, line?.description]);

    const isSubtotal = isSubtotalLine(line);
    // Bandeau is full-width; total cells are reused for visual layout.
    // The action cell mirrors LineRow so the column count stays in sync.
    const baseClass = isSubtotal
        ? "border-t border-soft-border/60 bg-medium-bg/60"
        : "border-t border-soft-border/60 bg-emerald-50/70";
    const labelDisplay = String(label || "").trim() || (isSubtotal ? "(Sous-total)" : "(Titre)");
    // Sub-total formatted from the precomputed map (HT only -- TTC kept
    // for future templates).
    const subtotalHt = subtotal ? subtotal.ht : null;

    return (
        <tr className={baseClass}>
            <td className="px-3 py-2 text-soft-text text-xs align-middle">{idx + 1}</td>
            <td colSpan={5} className="px-3 py-2 align-middle">
                {editing ? (
                    <input
                        type="text"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        className="w-full rounded border border-soft-border px-2 py-1 text-sm"
                        placeholder={isSubtotal ? "Libellé du sous-total" : "Libellé de la section"}
                    />
                ) : (
                    <span className="font-semibold text-strong-text">
                        {isSubtotal ? "Sous-total: " : ""}{labelDisplay}
                    </span>
                )}
            </td>
            <td className="px-3 py-2 text-right tabular-nums font-semibold text-strong-text">
                {isSubtotal && subtotalHt !== null ? `${formatAmount(subtotalHt)}` : ""}
            </td>
            {!readOnly ? (
                <td className="px-3 py-2 text-right">
                    {editing ? (
                        <div className="inline-flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => {
                                    const trimmed = label.trim();
                                    if (!trimmed) return;
                                    onSave({ label: trimmed, description: trimmed });
                                }}
                                className="px-2 py-0.5 rounded-md bg-primary text-white text-xs font-medium hover:brightness-110"
                            >
                                Valider
                            </button>
                            <button
                                type="button"
                                onClick={onCancelEdit}
                                className="px-2 py-0.5 rounded-md border border-soft-border text-xs hover:bg-medium-bg/50"
                            >
                                Annuler
                            </button>
                        </div>
                    ) : (
                        <div className="inline-flex items-center gap-1">
                            {onMoveUp ? (
                                <button type="button" onClick={onMoveUp} title="Monter" className="p-1 text-soft-text hover:text-strong-text">
                                    <FaArrowUp className="text-[11px]" />
                                </button>
                            ) : null}
                            {onMoveDown ? (
                                <button type="button" onClick={onMoveDown} title="Descendre" className="p-1 text-soft-text hover:text-strong-text">
                                    <FaArrowDown className="text-[11px]" />
                                </button>
                            ) : null}
                            <button type="button" onClick={onStartEdit} title="Modifier" className="p-1 text-soft-text hover:text-primary">
                                <FaPenToSquare className="text-[11px]" />
                            </button>
                            <button type="button" onClick={onDelete} title="Supprimer" className="p-1 text-soft-text hover:text-red-600">
                                <FaTrash className="text-[11px]" />
                            </button>
                        </div>
                    )}
                </td>
            ) : null}
        </tr>
    );
};

// One row of the lines table. When `editing`, qty/subprice/tvaTx/remise are
// rendered as inline inputs and a "Valider" button submits the patch.
const LineRow = ({ line, idx, readOnly, editing, onStartEdit, onCancelEdit, onSave, onDelete, onMoveUp, onMoveDown }) => {
    const [qty, setQty] = useState(String(line.qty ?? 1));
    const [subprice, setSubprice] = useState(String(line.subprice ?? 0));
    const [tvaTx, setTvaTx] = useState(String(line.tvaTx ?? line.tva_tx ?? 0));
    const [remise, setRemise] = useState(String(line.remisePercent ?? line.remise_percent ?? 0));

    useEffect(() => {
        setQty(String(line.qty ?? 1));
        setSubprice(String(line.subprice ?? 0));
        setTvaTx(String(line.tvaTx ?? line.tva_tx ?? 0));
        setRemise(String(line.remisePercent ?? line.remise_percent ?? 0));
    }, [line.id, line.qty, line.subprice, line.tvaTx, line.tva_tx, line.remisePercent, line.remise_percent]);

    const totalHt = computeLineTotalHt(editing
        ? { qty, subprice, remisePercent: remise }
        : line);

    const desc = String(line.label || line.description || "").trim();

    return (
        <tr className="border-t border-soft-border/60 hover:bg-medium-bg/30">
            <td className="px-3 py-1.5 text-soft-text text-xs">{idx + 1}</td>
            <td className="px-3 py-1.5 text-strong-text">
                <div className="font-medium truncate max-w-[420px]" title={desc}>{desc || "(sans description)"}</div>
                {line.fkProduct || line.fk_product ? (
                    <div className="text-xs text-soft-text">Produit #{line.fkProduct || line.fk_product}</div>
                ) : null}
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums">
                {editing
                    ? <input type="number" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} className="w-16 text-right rounded border border-soft-border px-1 py-0.5" />
                    : formatAmount(line.qty)}
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums">
                {editing
                    ? <input type="number" step="0.01" value={subprice} onChange={(e) => setSubprice(e.target.value)} className="w-24 text-right rounded border border-soft-border px-1 py-0.5" />
                    : formatAmount(line.subprice)}
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums">
                {editing
                    ? <input type="number" step="0.01" value={tvaTx} onChange={(e) => setTvaTx(e.target.value)} className="w-16 text-right rounded border border-soft-border px-1 py-0.5" />
                    : formatAmount(line.tvaTx ?? line.tva_tx)}
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums">
                {editing
                    ? <input type="number" step="0.01" value={remise} onChange={(e) => setRemise(e.target.value)} className="w-16 text-right rounded border border-soft-border px-1 py-0.5" />
                    : formatAmount(line.remisePercent ?? line.remise_percent)}
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-strong-text">{formatAmount(totalHt)}</td>
            {!readOnly ? (
                <td className="px-3 py-1.5 text-right">
                    {editing ? (
                        <div className="inline-flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => onSave({ qty: Number(qty), subprice: Number(subprice), tva_tx: Number(tvaTx), remise_percent: Number(remise) })}
                                className="px-2 py-0.5 rounded-md bg-primary text-white text-xs font-medium hover:brightness-110"
                            >
                                Valider
                            </button>
                            <button
                                type="button"
                                onClick={onCancelEdit}
                                className="px-2 py-0.5 rounded-md border border-soft-border text-xs hover:bg-medium-bg/50"
                            >
                                Annuler
                            </button>
                        </div>
                    ) : (
                        <div className="inline-flex items-center gap-1">
                            {onMoveUp ? (
                                <button type="button" onClick={onMoveUp} title="Monter" className="p-1 text-soft-text hover:text-strong-text">
                                    <FaArrowUp className="text-[11px]" />
                                </button>
                            ) : null}
                            {onMoveDown ? (
                                <button type="button" onClick={onMoveDown} title="Descendre" className="p-1 text-soft-text hover:text-strong-text">
                                    <FaArrowDown className="text-[11px]" />
                                </button>
                            ) : null}
                            <button type="button" onClick={onStartEdit} title="Modifier" className="p-1 text-soft-text hover:text-primary">
                                <FaPenToSquare className="text-[11px]" />
                            </button>
                            <button type="button" onClick={onDelete} title="Supprimer" className="p-1 text-soft-text hover:text-red-600">
                                <FaTrash className="text-[11px]" />
                            </button>
                        </div>
                    )}
                </td>
            ) : null}
        </tr>
    );
};

// Footer add-form rendered below the table when "Ajouter ligne libre" is
// clicked. Submits a free-text description + qty/subprice/tva/remise/type.
const AddFreeLineForm = ({ onSubmit, onCancel, busy }) => {
    const [description, setDescription] = useState("");
    const [qty, setQty] = useState("1");
    const [subprice, setSubprice] = useState("0");
    const [tvaTx, setTvaTx] = useState("20");
    const [remise, setRemise] = useState("0");
    const [productType, setProductType] = useState("0");

    const submit = () => {
        const payload = buildFreeLinePayload({ description, qty, subprice, tvaTx, remise, productType });
        if (!payload) return;
        onSubmit(payload);
    };

    return (
        <div className="border-t border-soft-border bg-soft-bg/50 p-4 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-soft-text">
                Nouvelle ligne libre
            </div>
            <Textarea
                value={description}
                onChange={setDescription}
                label="Description *"
                rows={2}
            />
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <Input value={qty} onChange={setQty} label="Quantité" type="int" />
                <Input value={subprice} onChange={setSubprice} label="PU HT" type="int" />
                <Input value={tvaTx} onChange={setTvaTx} label="TVA %" type="int" />
                <Input value={remise} onChange={setRemise} label="Remise %" type="int" />
                <Select
                    labels={labelsWithFallback("Select")}
                    value={productType}
                    onChange={setProductType}
                    label="Type"
                    options={[{ label: "Produit", value: "0" }, { label: "Service", value: "1" }]}
                />
            </div>
            <div className="flex justify-end gap-2">
                <button type="button" onClick={onCancel} disabled={busy} className="rounded-md border border-soft-border px-3 py-1.5 text-sm hover:bg-medium-bg/50 disabled:opacity-60">
                    Annuler
                </button>
                <button type="button" onClick={submit} disabled={busy || !description.trim()} className="rounded-md border border-primary bg-primary px-3 py-1.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-60">
                    {busy ? "Ajout..." : "Ajouter"}
                </button>
            </div>
        </div>
    );
};

// Footer add-form for product / service line. Backend auto-hydrates desc /
// subprice / tva_tx / type from Product, the user only picks + sets qty.
// We still let them tweak qty/remise before submit; description override is
// optional (left empty to take Product->description).
const AddProductLineForm = ({ onSubmit, onCancel, busy }) => {
    const [productId, setProductId] = useState(0);
    const [qty, setQty] = useState("1");
    const [remise, setRemise] = useState("0");
    const [overrideDesc, setOverrideDesc] = useState("");

    const submit = () => {
        const payload = buildProductLinePayload({ productId, qty, remise, overrideDesc });
        if (!payload) return;
        onSubmit(payload);
    };

    return (
        <div className="border-t border-soft-border bg-soft-bg/50 p-4 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-soft-text">
                Nouvelle ligne produit / service
            </div>
            <FkPicker
                label="Produit / service *"
                endpoint="product"
                value={productId}
                onChange={setProductId}
                placeholder="Rechercher par ref ou libellé..."
                required
            />
            <div className="grid grid-cols-2 gap-3">
                <Input value={qty} onChange={setQty} label="Quantité" type="int" />
                <Input value={remise} onChange={setRemise} label="Remise %" type="int" />
            </div>
            <Textarea
                value={overrideDesc}
                onChange={setOverrideDesc}
                label="Description (laisser vide pour utiliser celle du produit)"
                rows={2}
            />
            <div className="flex justify-end gap-2">
                <button type="button" onClick={onCancel} disabled={busy} className="rounded-md border border-soft-border px-3 py-1.5 text-sm hover:bg-medium-bg/50 disabled:opacity-60">
                    Annuler
                </button>
                <button type="button" onClick={submit} disabled={busy || !productId} className="rounded-md border border-primary bg-primary px-3 py-1.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-60">
                    {busy ? "Ajout..." : "Ajouter"}
                </button>
            </div>
        </div>
    );
};

// Footer add-form for a section line (title or sub-total). User picks
// the kind via a radio group and types the label. No qty / subprice /
// TVA -- the line is purely decorative (or a roll-up marker for
// sub-totals). Cf SECTION_PRODUCT_TYPE / SUBTOTAL_SPECIAL_CODE in
// useDocumentLinesEditor.js for the persistence convention.
const AddSectionLineForm = ({ onSubmit, onCancel, busy }) => {
    const [kind, setKind] = useState("title");
    const [label, setLabel] = useState("");

    const trimmed = label.trim();

    const submit = () => {
        const payload = buildSectionLinePayload({ kind, label });
        if (!payload) return;
        onSubmit(payload);
    };

    return (
        <div className="border-t border-soft-border bg-soft-bg/50 p-4 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-soft-text">
                Nouvelle section
            </div>
            <div className="flex items-center gap-4">
                <label className="inline-flex items-center gap-2 text-sm">
                    <input
                        type="radio"
                        name="dpk-section-kind"
                        value="title"
                        checked={kind === "title"}
                        onChange={() => setKind("title")}
                    />
                    Titre
                </label>
                <label className="inline-flex items-center gap-2 text-sm">
                    <input
                        type="radio"
                        name="dpk-section-kind"
                        value="subtotal"
                        checked={kind === "subtotal"}
                        onChange={() => setKind("subtotal")}
                    />
                    Sous-total
                </label>
            </div>
            <Input
                value={label}
                onChange={setLabel}
                label={kind === "subtotal" ? "Libellé du sous-total *" : "Libellé du titre *"}
                type="varchar"
            />
            <div className="flex justify-end gap-2">
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={busy}
                    className="rounded-md border border-soft-border px-3 py-1.5 text-sm hover:bg-medium-bg/50 disabled:opacity-60"
                >
                    Annuler
                </button>
                <button
                    type="button"
                    onClick={submit}
                    disabled={busy || !trimmed}
                    className="rounded-md border border-primary bg-primary px-3 py-1.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-60"
                >
                    {busy ? "Ajout..." : "Ajouter"}
                </button>
            </div>
        </div>
    );
};
