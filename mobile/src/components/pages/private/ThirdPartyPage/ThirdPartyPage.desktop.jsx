import { FaArrowLeft, FaPen, FaTrash } from "react-icons/fa6";

import { DocumentHeaderFields } from "src/lib/datatable";
import { ThirdPartyCategoriesSection } from "src/lib/components/ThirdPartyCategoriesSection";
import { ThirdPartyBankSection } from "src/lib/components/ThirdPartyBankSection";

// Desktop rendering of the third party detail page. Single-column centered
// layout (no lines feature here -- read-only document with header only).
//
// Strict adherence to .claude/CLAUDE.md "Conventions UI desktop épurées" :
//   - bg-white rounded-xl border border-soft-border (no shadow)
//   - density tight (p-3/p-4 max)
//   - separators via border-b, never shadow
//   - hover:bg-medium-bg only, no transition-all, no hover:shadow-md
//   - no active:, no rounded-2xl, no gradient on cards.

export const HEADER_OVERRIDES = {
    name:             { defaultVisible: true },
    nameAlias:        { defaultVisible: true },
    codeClient:       { defaultVisible: true },
    codeFournisseur:  { defaultVisible: true },
    client:           { defaultVisible: true,  formatter: (v) => Number(v) > 0 ? "Oui" : "Non" },
    fournisseur:      { defaultVisible: true,  formatter: (v) => Number(v) > 0 ? "Oui" : "Non" },
    address:          { defaultVisible: true },
    zip:              { defaultVisible: true },
    town:             { defaultVisible: true },
    countryCode:      { defaultVisible: true },
    phone:            { defaultVisible: true },
    email:            { defaultVisible: true },
    url:              { defaultVisible: true },
    siren:            { defaultVisible: false },
    siret:            { defaultVisible: false },
    tvaIntra:         { defaultVisible: false },
};

export const ThirdPartyPageDesktop = (props) => {
    const {
        item, loading, error, deleting,
        handleBack, handleEdit, handleDelete,
        dataSource,
    } = props;

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

                <span className="flex-1" />

                {!loading && item && (
                    <div className="flex items-center gap-2">
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

            {/* Centered single-column body */}
            <div className="flex-1 min-h-0 overflow-auto px-4 py-4">
                {loading && (
                    <div className="text-center text-soft-text text-sm py-10">
                        Chargement...
                    </div>
                )}

                {!loading && item && (
                    <div className="max-w-[1200px] mx-auto flex flex-col lg:flex-row gap-4 items-start">
                        {/* Main column: header fields */}
                        <div className="flex-1 min-w-0 w-full">
                            <DocumentHeaderFields
                                object={item}
                                feature="thirdparty"
                                dataSource={dataSource}
                                storageKey="dolipocket.thirdpartypage.header"
                                title="Informations"
                                overrides={HEADER_OVERRIDES}
                            />
                        </div>

                        {/* Side column: categories + bank accounts */}
                        <div className="w-full lg:w-[340px] shrink-0 flex flex-col gap-4">
                            <ThirdPartyCategoriesSection
                                thirdpartyId={Number(item.id)}
                                dataSource={dataSource}
                            />
                            <ThirdPartyBankSection
                                thirdpartyId={Number(item.id)}
                                dataSource={dataSource}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
