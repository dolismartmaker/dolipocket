import { useEffect, useState } from "react";
import { FaXmark } from "react-icons/fa6";

import { Input, Textarea, Select } from "@cap-rel/smartcommon";

import { FkPicker } from "src/lib/forms/FkPicker";

import {
    buildFreeLinePayload,
    buildProductLinePayload,
    buildSectionLinePayload,
    isSubtotalLine,
} from "./useDocumentLinesEditor";

// <LineFormMobile>
//
// Bottom-sheet form used on mobile by <DocumentLinesEditorMobile> to:
//   - add a free line ("free")
//   - add a product/service line ("product")
//   - edit an existing line ("edit")
//
// Touch-first: vertical layout, full-width inputs, 44px+ tap targets.
// Renders a bottom sheet covering up to 90vh of the viewport with a
// backdrop. Submits the same payloads as the desktop variant so the
// backend treats both inputs the same way.
//
// Props:
//   mode        "free" | "product" | "section" | "edit" | "editSection"
//   line        when mode === "edit" / "editSection", the existing line
//               to seed the form
//   onSubmit    async (payload) => void. Caller decides which CRUD op.
//   onClose     close the sheet without submitting
//   busy        boolean -- disables buttons while a mutation is in flight
export const LineFormMobile = ({ mode, line, onSubmit, onClose, busy }) => {
    if (mode === "edit") {
        return <EditLineSheet line={line} onSubmit={onSubmit} onClose={onClose} busy={busy} />;
    }
    if (mode === "editSection") {
        return <EditSectionSheet line={line} onSubmit={onSubmit} onClose={onClose} busy={busy} />;
    }
    if (mode === "product") {
        return <AddProductSheet onSubmit={onSubmit} onClose={onClose} busy={busy} />;
    }
    if (mode === "free") {
        return <AddFreeSheet onSubmit={onSubmit} onClose={onClose} busy={busy} />;
    }
    if (mode === "section") {
        return <AddSectionSheet onSubmit={onSubmit} onClose={onClose} busy={busy} />;
    }
    return null;
};

// Shared shell: backdrop + bottom-up sheet. Mobile-first rounding /
// shadow allowed here (cf .claude/CLAUDE.md: density relaxed on
// mobile). Sheet is scrollable inside; the action bar stays pinned to
// the bottom of the sheet so submit/cancel remain reachable on tall
// forms.
const Sheet = ({ title, onClose, busy, onSubmit, submitLabel, submitDisabled, children }) => (
    <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
        role="dialog"
        aria-modal="true"
    >
        <div
            className="absolute inset-0 bg-black/50"
            onClick={busy ? undefined : onClose}
        />
        <div className="relative bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col shadow-lg">
            <header className="flex items-center justify-between px-4 py-3 border-b border-soft-border shrink-0">
                <h2 className="text-base font-semibold text-strong-text">{title}</h2>
                <button
                    type="button"
                    onClick={onClose}
                    disabled={busy}
                    className="p-2 -mr-2 text-soft-text hover:text-strong-text rounded-md disabled:opacity-50 active:bg-medium-bg/50"
                    aria-label="Fermer"
                >
                    <FaXmark />
                </button>
            </header>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {children}
            </div>
            <footer className="flex gap-2 px-4 py-3 border-t border-soft-border shrink-0">
                <button
                    type="button"
                    onClick={onClose}
                    disabled={busy}
                    className="flex-1 py-3 rounded-lg border border-soft-border text-strong-text font-medium active:bg-medium-bg/50 disabled:opacity-60"
                >
                    Annuler
                </button>
                <button
                    type="button"
                    onClick={onSubmit}
                    disabled={busy || submitDisabled}
                    className="flex-1 py-3 rounded-lg bg-primary text-white font-medium active:brightness-90 disabled:opacity-60"
                >
                    {busy ? "..." : submitLabel}
                </button>
            </footer>
        </div>
    </div>
);

// Add a free-form line on mobile. Fields stacked vertically, larger
// inputs than desktop for finger tap.
const AddFreeSheet = ({ onSubmit, onClose, busy }) => {
    const [description, setDescription] = useState("");
    const [qty, setQty] = useState("1");
    const [subprice, setSubprice] = useState("0");
    const [tvaTx, setTvaTx] = useState("20");
    const [remise, setRemise] = useState("0");
    const [productType, setProductType] = useState("0");

    const trimmed = description.trim();

    const submit = () => {
        const payload = buildFreeLinePayload({ description, qty, subprice, tvaTx, remise, productType });
        if (!payload) return;
        onSubmit(payload);
    };

    return (
        <Sheet
            title="Nouvelle ligne libre"
            onClose={onClose}
            busy={busy}
            onSubmit={submit}
            submitLabel="Ajouter"
            submitDisabled={!trimmed}
        >
            <Textarea
                value={description}
                onChange={setDescription}
                label="Description *"
                rows={3}
            />
            <div className="grid grid-cols-2 gap-3">
                <Input value={qty} onChange={setQty} label="Quantité" type="int" />
                <Input value={subprice} onChange={setSubprice} label="PU HT" type="int" />
                <Input value={tvaTx} onChange={setTvaTx} label="TVA %" type="int" />
                <Input value={remise} onChange={setRemise} label="Remise %" type="int" />
            </div>
            <Select
                value={productType}
                onChange={setProductType}
                label="Type"
                options={[{ label: "Produit", value: "0" }, { label: "Service", value: "1" }]}
            />
        </Sheet>
    );
};

// Add a product line on mobile. The picker takes the full sheet width;
// the user only sets quantity / remise (backend hydrates subprice / TVA
// / description from the product).
const AddProductSheet = ({ onSubmit, onClose, busy }) => {
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
        <Sheet
            title="Nouvelle ligne produit / service"
            onClose={onClose}
            busy={busy}
            onSubmit={submit}
            submitLabel="Ajouter"
            submitDisabled={!productId}
        >
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
        </Sheet>
    );
};

// Edit an existing line on mobile. Allows tweaking qty / subprice /
// TVA / remise (same patch fields as the desktop inline edit). The
// description is editable as a courtesy -- desktop currently does not
// re-edit description after creation but mobile gets it for free since
// the form is already laid out vertically.
const EditLineSheet = ({ line, onSubmit, onClose, busy }) => {
    const [description, setDescription] = useState(String(line?.label || line?.description || ""));
    const [qty, setQty] = useState(String(line?.qty ?? 1));
    const [subprice, setSubprice] = useState(String(line?.subprice ?? 0));
    const [tvaTx, setTvaTx] = useState(String(line?.tvaTx ?? line?.tva_tx ?? 0));
    const [remise, setRemise] = useState(String(line?.remisePercent ?? line?.remise_percent ?? 0));

    useEffect(() => {
        setDescription(String(line?.label || line?.description || ""));
        setQty(String(line?.qty ?? 1));
        setSubprice(String(line?.subprice ?? 0));
        setTvaTx(String(line?.tvaTx ?? line?.tva_tx ?? 0));
        setRemise(String(line?.remisePercent ?? line?.remise_percent ?? 0));
    }, [line?.id, line?.rowid]);

    const submit = () => {
        const patch = {
            qty: Number(qty),
            subprice: Number(subprice),
            tva_tx: Number(tvaTx),
            remise_percent: Number(remise),
        };
        const trimmed = String(description || "").trim();
        const before = String(line?.label || line?.description || "").trim();
        if (trimmed !== before) {
            patch.label = trimmed;
            patch.description = trimmed;
        }
        onSubmit(patch);
    };

    return (
        <Sheet
            title="Modifier la ligne"
            onClose={onClose}
            busy={busy}
            onSubmit={submit}
            submitLabel="Enregistrer"
            submitDisabled={!description.trim()}
        >
            <Textarea
                value={description}
                onChange={setDescription}
                label="Description *"
                rows={3}
            />
            <div className="grid grid-cols-2 gap-3">
                <Input value={qty} onChange={setQty} label="Quantité" type="int" />
                <Input value={subprice} onChange={setSubprice} label="PU HT" type="int" />
                <Input value={tvaTx} onChange={setTvaTx} label="TVA %" type="int" />
                <Input value={remise} onChange={setRemise} label="Remise %" type="int" />
            </div>
        </Sheet>
    );
};

// Add a section line (title or sub-total) on mobile. The user picks
// the kind via two big buttons (touch-first) and types the label.
// Sub-totals are flagged via SUBTOTAL_SPECIAL_CODE upstream; the form
// itself does not perform any computation.
const AddSectionSheet = ({ onSubmit, onClose, busy }) => {
    const [kind, setKind] = useState("title");
    const [label, setLabel] = useState("");

    const trimmed = label.trim();

    const submit = () => {
        const payload = buildSectionLinePayload({ kind, label });
        if (!payload) return;
        onSubmit(payload);
    };

    return (
        <Sheet
            title="Nouvelle section"
            onClose={onClose}
            busy={busy}
            onSubmit={submit}
            submitLabel="Ajouter"
            submitDisabled={!trimmed}
        >
            <div className="grid grid-cols-2 gap-2">
                <button
                    type="button"
                    onClick={() => setKind("title")}
                    className={
                        "py-3 rounded-lg border text-sm font-medium " +
                        (kind === "title"
                            ? "border-emerald-400 bg-emerald-50 text-strong-text"
                            : "border-soft-border bg-white text-soft-text")
                    }
                >
                    Titre
                </button>
                <button
                    type="button"
                    onClick={() => setKind("subtotal")}
                    className={
                        "py-3 rounded-lg border text-sm font-medium " +
                        (kind === "subtotal"
                            ? "border-primary bg-soft-bg text-strong-text"
                            : "border-soft-border bg-white text-soft-text")
                    }
                >
                    Sous-total
                </button>
            </div>
            <Input
                value={label}
                onChange={setLabel}
                label={kind === "subtotal" ? "Libellé du sous-total *" : "Libellé du titre *"}
                type="varchar"
            />
        </Sheet>
    );
};

// Edit an existing section line (title or sub-total). The user can
// retype the label but not switch the kind -- changing a sub-total to
// a title would invalidate the running sub-total calculation upstream
// in unpredictable ways, so we keep the original kind locked.
const EditSectionSheet = ({ line, onSubmit, onClose, busy }) => {
    const [label, setLabel] = useState(String(line?.label || line?.description || ""));

    useEffect(() => {
        setLabel(String(line?.label || line?.description || ""));
    }, [line?.id, line?.rowid]);

    const isSubtotal = isSubtotalLine(line);
    const trimmed = label.trim();

    const submit = () => {
        if (!trimmed) return;
        // Patch label + description; do not re-submit special_code so
        // the backend preserves it via the "fall back to existing line"
        // branch in updateLine.
        onSubmit({ label: trimmed, description: trimmed });
    };

    return (
        <Sheet
            title={isSubtotal ? "Modifier le sous-total" : "Modifier le titre"}
            onClose={onClose}
            busy={busy}
            onSubmit={submit}
            submitLabel="Enregistrer"
            submitDisabled={!trimmed}
        >
            <Input
                value={label}
                onChange={setLabel}
                label={isSubtotal ? "Libellé du sous-total *" : "Libellé du titre *"}
                type="varchar"
            />
        </Sheet>
    );
};
