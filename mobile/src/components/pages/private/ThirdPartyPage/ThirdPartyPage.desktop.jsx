import { FaArrowLeft, FaPen, FaTrash } from "react-icons/fa6";

import { useMenu } from "src/lib/permissions";
import { ThirdPartyCockpit } from "src/lib/cockpit/ThirdPartyCockpit";
import { ThirdPartyActions } from "./ThirdPartyActions";

// Desktop rendering of the third party detail page: a "cockpit" -- a 360
// synthesis of the thirdparty (coordinates, sales KPIs, turnover chart, recent
// and unpaid invoices, contacts, events, categories, bank accounts) laid out
// as a masonry of cards that fills the available width (cf .claude/CLAUDE.md
// "Fiche tiers = cockpit").
//
// Strict adherence to .claude/CLAUDE.md "Conventions UI desktop épurées":
//   - bg-white rounded-xl border border-soft-border (no shadow)
//   - density tight, separators via border-b, hover:bg-medium-bg only
//   - no transition-all, no active:, no rounded-2xl, no gradient on cards.

const Chip = ({ label, cls }) => (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${cls}`}>
        {label}
    </span>
);

export const ThirdPartyPageDesktop = (props) => {
    const {
        item, loading, error, deleting,
        handleBack, handleEdit, handleDelete, saveField,
        dataSource,
    } = props;

    const { has } = useMenu();
    const canEdit = has("thirdparty.write");

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
                    {loading ? "Chargement..." : (item?.name || "Tiers")}
                </h1>
                {item?.nameAlias && (
                    <span className="text-[12px] text-soft-text truncate">{item.nameAlias}</span>
                )}

                {!loading && item && (
                    <div className="flex items-center gap-1.5">
                        {(item.client === 1 || item.client === 3) && (
                            <Chip label="Client" cls="bg-green-100 text-green-800" />
                        )}
                        {(item.client === 2 || item.client === 3) && (
                            <Chip label="Prospect" cls="bg-sky-100 text-sky-800" />
                        )}
                        {item.fournisseur > 0 && (
                            <Chip label="Fournisseur" cls="bg-violet-100 text-violet-800" />
                        )}
                        <Chip
                            label={item.status === 0 ? "Fermé" : "Ouvert"}
                            cls={item.status === 0 ? "bg-gray-100 text-gray-600" : "bg-emerald-100 text-emerald-800"}
                        />
                    </div>
                )}

                <span className="flex-1" />

                {!loading && item && (
                    <div className="flex items-center gap-2">
                        <ThirdPartyActions item={item} dataSource={dataSource} />
                        <button
                            type="button"
                            onClick={handleEdit}
                            disabled={deleting}
                            className="h-[28px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                        >
                            <FaPen className="text-[11px]" />
                            <span>Modifier</span>
                        </button>
                        <button
                            type="button"
                            onClick={handleDelete}
                            disabled={deleting}
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

            {/* Cockpit body */}
            <div className="flex-1 min-h-0 overflow-auto px-4 py-4">
                {loading && (
                    <div className="text-center text-soft-text text-sm py-10">
                        Chargement...
                    </div>
                )}

                {!loading && item && (
                    <ThirdPartyCockpit
                        item={item}
                        dataSource={dataSource}
                        editable={canEdit}
                        onSaveField={saveField}
                    />
                )}
            </div>
        </div>
    );
};
