import { useState } from "react";
import { FaCheck, FaArrowsRotate, FaEye, FaPlus, FaGripVertical } from "react-icons/fa6";

// Sticky toolbar shown while the cockpit is in edit mode. Holds the global
// actions (reset, done) and a collapsible drawer listing the hidden boxes so
// the user can bring them back. Styled with the amber "edit" accent, matching
// the DataTable ColumnConfigurator and the per-box chrome bar.
//
// Props:
//   hiddenBoxes  [{ id, label }]  available-but-hidden boxes.
//   onShow(id)   re-show a hidden box.
//   onReset()    restore the registry defaults.
//   onDone()     leave edit mode.
export const CockpitEditToolbar = ({ hiddenBoxes = [], onShow, onReset, onDone }) => {
    const [drawerOpen, setDrawerOpen] = useState(false);

    return (
        <div className="sticky top-0 z-10 mb-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-900">
            <div className="flex items-center gap-2 px-3 py-2">
                <FaGripVertical className="text-amber-500 text-xs" aria-hidden="true" />
                <span className="text-[13px] font-medium">{"Personnalisation de l'affichage"}</span>
                <span className="text-[12px] text-amber-700 hidden sm:inline">
                    - glissez les boîtes pour les réordonner
                </span>
                <span className="flex-1" />

                <button
                    type="button"
                    onClick={() => setDrawerOpen((v) => !v)}
                    className="px-2.5 py-1 bg-white border border-amber-300 rounded text-[12px] flex items-center gap-1 hover:bg-amber-100 transition-colors"
                    title="Boîtes masquées"
                >
                    <FaEye className="text-[11px]" />
                    <span>Masquées</span>
                    <span className="text-[11px] text-amber-600">({hiddenBoxes.length})</span>
                </button>

                <button
                    type="button"
                    onClick={onReset}
                    className="px-2.5 py-1 bg-white border border-amber-300 rounded text-[12px] flex items-center gap-1 hover:bg-amber-100 transition-colors"
                    title="Réinitialiser l'affichage par défaut"
                >
                    <FaArrowsRotate className="text-[11px]" />
                    <span>Réinitialiser</span>
                </button>

                <button
                    type="button"
                    onClick={onDone}
                    className="px-3 py-1 bg-primary text-white rounded text-[12px] flex items-center gap-1 hover:bg-primary/90 transition-colors"
                >
                    <FaCheck className="text-[11px]" />
                    <span>Terminer</span>
                </button>
            </div>

            {drawerOpen && (
                <div className="px-3 pb-2.5 border-t border-amber-200">
                    {hiddenBoxes.length === 0 ? (
                        <div className="py-3 text-center text-[12px] text-amber-700">
                            Aucune boîte masquée.
                        </div>
                    ) : (
                        <ul className="flex flex-wrap gap-2 pt-2.5">
                            {hiddenBoxes.map((box) => (
                                <li key={box.id}>
                                    <button
                                        type="button"
                                        onClick={() => onShow(box.id)}
                                        className="px-2.5 py-1 bg-white border border-amber-300 rounded-full text-[12px] flex items-center gap-1.5 hover:bg-amber-100 transition-colors"
                                        title={`Afficher : ${box.label}`}
                                    >
                                        <FaPlus className="text-[10px] text-amber-600" />
                                        <span className="text-strong-text">{box.label}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
};
