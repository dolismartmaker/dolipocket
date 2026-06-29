import { useState } from "react";
import { FaAnglesLeft } from "react-icons/fa6";

import { DocumentLinesEditor } from "src/lib/datatable/DocumentLinesEditor";

import { CommandBar } from "./CommandBar";
import { SummaryBand } from "./SummaryBand";
import { FlowRibbon } from "./FlowRibbon";
import { InspectorRail } from "./InspectorRail";

// Generic detail shell shared by every "document with lines" page (Proposal,
// Order, Invoice, SupplierOrder, SupplierInvoice, SupplierProposal). All the
// per-feature variation lives in a declarative `config` descriptor
// (documentConfig.jsx); the page wrapper is reduced to a few lines.
//
// Cockpit layout:
//   [ command bar ]        primary CTA + secondaries + overflow menu
//   [ summary band ]       thirdparty + dates + hero total + payment gauge
//   [ flow ribbon ]        commercial cycle + linked-doc chips
//   [ lines | inspector ]  full-width editable lines + sticky tabbed rail
//
// `data` is the full useXxxData() hook result (object + handlers + dataSource
// + modal state). The shell reads the object via config.objectKey and never
// hard-codes a feature name.

const RAIL_STORAGE_KEY = "dolipocket.docshell.rail";

const readRailOpen = () => {
    try {
        return localStorage.getItem(RAIL_STORAGE_KEY) !== "0";
    } catch {
        return true;
    }
};

export const DocumentDetailShell = ({ config, data }) => {
    const object = data[config.objectKey];
    const { loading, error } = data;

    const [railOpen, setRailOpen] = useState(readRailOpen);

    const setRail = (open) => {
        setRailOpen(open);
        try {
            localStorage.setItem(RAIL_STORAGE_KEY, open ? "1" : "0");
        } catch {
            // ignore persistence failures (private mode, quota...)
        }
    };

    const setObject = config.setObject ? config.setObject(data) : null;

    return (
        <>
            <div className="flex flex-col h-full w-full bg-medium-bg overflow-hidden">
                <CommandBar config={config} object={object} data={data} loading={loading} />

                {error && (
                    <div className="shrink-0 mx-4 mt-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm">
                        {error}
                    </div>
                )}

                {!loading && object && <SummaryBand config={config} object={object} />}
                {!loading && object && (
                    <FlowRibbon config={config} object={object} dataSource={data.dataSource} />
                )}

                <div className="flex-1 min-h-0 overflow-auto">
                    {loading && (
                        <div className="text-center text-soft-text text-sm py-10">Chargement...</div>
                    )}

                    {!loading && object && (
                        <div className="flex gap-4 px-4 py-4 max-w-[1500px] mx-auto">
                            <main className="flex-1 min-w-0">
                                <DocumentLinesEditor
                                    docId={Number(object.id)}
                                    lines={object.lines ?? []}
                                    dataSource={data.dataSource}
                                    onChange={(updated) => {
                                        if (updated && typeof setObject === "function") setObject(updated);
                                    }}
                                    readOnly={object.statut !== 0}
                                />
                            </main>

                            {railOpen ? (
                                <InspectorRail
                                    config={config}
                                    object={object}
                                    data={data}
                                    onCollapse={() => setRail(false)}
                                />
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setRail(true)}
                                    className="shrink-0 self-start sticky top-0 h-9 w-9 flex items-center justify-center rounded-lg border border-soft-border bg-white text-soft-text hover:bg-medium-bg hover:text-strong-text transition-colors"
                                    aria-label="Afficher le panneau"
                                    title="Afficher le panneau"
                                >
                                    <FaAnglesLeft className="text-[12px]" />
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {config.renderModals ? config.renderModals(data) : null}
        </>
    );
};
