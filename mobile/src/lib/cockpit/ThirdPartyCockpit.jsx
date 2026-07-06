import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaSliders } from "react-icons/fa6";

import { DocumentHeaderFields } from "src/lib/datatable";
import { ThirdPartyCategoriesSection } from "src/lib/components/ThirdPartyCategoriesSection";
import { ThirdPartyBankSection } from "src/lib/components/ThirdPartyBankSection";

import { useThirdPartyCockpit } from "./useThirdPartyCockpit";
import { useCockpitLayout } from "./useCockpitLayout";
import { THIRDPARTY_COCKPIT_BOXES, resolveLimit } from "./layoutRegistry";
import { BoxChrome } from "./BoxChrome";
import { CockpitEditToolbar } from "./CockpitEditToolbar";
import { HEADER_OVERRIDES } from "./headerOverrides";
import {
    SalesActivityCard,
    CaChartCard,
    RecentInvoicesCard,
    UnpaidInvoicesCard,
    ContactsCard,
    EventsCard,
    NotesCard,
} from "./cards";

// Desktop "cockpit": a 360 synthesis of a thirdparty laid out as a grid of
// user-arrangeable cards. Each user personalizes the layout (order, visibility,
// per-box width, collapse, and list length for the list cards) via a per-user
// preferences layer (cf useCockpitLayout -- hybrid localStorage/server).
//
// A long press on any box (or the "Personnaliser" button) enters edit mode,
// where boxes can be dragged to reorder, resized, collapsed or hidden. The
// layout is a CSS multi-column masonry (1 / 2 / 3 columns responsive) so boxes
// pack tightly with no wasted vertical space (an explicit grid would align rows
// to the tallest box and leave gaps). Drag-and-drop stays deterministic because
// each box element is itself the drop target: dropping onto box Y reorders the
// flat order (moveBox), and the masonry simply reflows.
//
// Strict adherence to .claude/CLAUDE.md "Conventions UI desktop épurées":
// bg-white rounded-xl border (no shadow), density tight, transition-colors.
export const ThirdPartyCockpit = ({ item, dataSource, editable = false, onSaveField }) => {
    const navigate = useNavigate();
    const { data, loading, error, reload } = useThirdPartyCockpit(item?.id, dataSource);
    const currency = data?.currency || "EUR";

    const layout = useCockpitLayout({ feature: "thirdparty", boxes: THIRDPARTY_COCKPIT_BOXES });
    const { resolved, editMode, setEditMode } = layout;

    // HTML5 drag state, scoped to the grid (same pattern as the DataTable
    // ColumnConfigurator).
    const [draggingId, setDraggingId] = useState(null);
    const [hoverId, setHoverId] = useState(null);

    const dragFor = (id) => ({
        isHover: hoverId === id && draggingId !== id,
        onDragStart: (e) => {
            setDraggingId(id);
            if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = "move";
                try { e.dataTransfer.setData("text/plain", id); } catch (_e) { /* ignore */ }
            }
        },
        onDragEnd: () => { setDraggingId(null); setHoverId(null); },
        onDragOver: (e) => {
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
            if (hoverId !== id) setHoverId(id);
        },
        onDrop: (e) => {
            e.preventDefault();
            if (draggingId && draggingId !== id) layout.moveBox(draggingId, id);
            setDraggingId(null);
            setHoverId(null);
        },
    });

    // A box is available (renderable) when its gating permission is granted and,
    // for Notes, when the thirdparty actually has a note. While the payload is
    // still loading, permission-gated boxes stay available so their own skeleton
    // shows instead of the tile popping in after load.
    const isAvailable = (box) => {
        if (box.requiresNote) return !!(item?.notePublic || "").trim();
        if (box.id === "sales") {
            if (!data) return true;
            const p = data.permissions || {};
            return !!(p.proposal || p.order || p.invoice);
        }
        if (box.permission) {
            if (!data) return true;
            return !!(data.permissions && data.permissions[box.permission]);
        }
        return true;
    };

    const renderBox = (box) => {
        const limit = resolveLimit(box.limit, box.defaultLimit ?? 5);
        switch (box.id) {
            case "coordinates":
                return (
                    <DocumentHeaderFields
                        object={item}
                        feature="thirdparty"
                        dataSource={dataSource}
                        storageKey="dolipocket.thirdpartypage.header"
                        title="Coordonnées"
                        overrides={HEADER_OVERRIDES}
                        editable={editable}
                        onSaveField={onSaveField}
                    />
                );
            case "sales":
                return <SalesActivityCard data={data} loading={loading} currency={currency} onRefresh={reload} />;
            case "unpaid":
                return (
                    <UnpaidInvoicesCard
                        data={data}
                        loading={loading}
                        limit={limit}
                        onRefresh={reload}
                        onRowClick={(id) => navigate(`/invoices/${id}`)}
                    />
                );
            case "caChart":
                return <CaChartCard data={data} loading={loading} currency={currency} onRefresh={reload} />;
            case "recentInvoices":
                return (
                    <RecentInvoicesCard
                        data={data}
                        loading={loading}
                        limit={limit}
                        onRefresh={reload}
                        onRowClick={(id) => navigate(`/invoices/${id}`)}
                    />
                );
            case "contacts":
                return (
                    <ContactsCard
                        data={data}
                        loading={loading}
                        limit={limit}
                        onRefresh={reload}
                        onRowClick={(id) => navigate(`/contacts/${id}`)}
                    />
                );
            case "events":
                return (
                    <EventsCard
                        data={data}
                        loading={loading}
                        limit={limit}
                        onRefresh={reload}
                        onRowClick={(id) => navigate(`/agenda/${id}`)}
                    />
                );
            case "notes":
                return <NotesCard item={item} />;
            case "categories":
                return <ThirdPartyCategoriesSection thirdpartyId={Number(item.id)} dataSource={dataSource} />;
            case "bank":
                return <ThirdPartyBankSection thirdpartyId={Number(item.id)} dataSource={dataSource} />;
            default:
                return null;
        }
    };

    const available = resolved.filter(isAvailable);
    const visibleBoxes = available.filter((b) => b.visible);
    const hiddenBoxes = available.filter((b) => !b.visible);

    return (
        <div className="w-full" data-testid="thirdparty-cockpit">
            {error && (
                <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2 rounded-md text-[12px]">
                    {error}
                </div>
            )}

            {editMode ? (
                <CockpitEditToolbar
                    hiddenBoxes={hiddenBoxes}
                    onShow={layout.show}
                    onReset={layout.resetAll}
                    onDone={() => setEditMode(false)}
                />
            ) : (
                <div className="flex justify-end mb-3">
                    <button
                        type="button"
                        onClick={() => setEditMode(true)}
                        data-testid="cockpit-customize"
                        className="px-2.5 py-1 rounded-md border border-soft-border bg-white text-[12px] text-soft-text hover:text-strong-text hover:bg-medium-bg flex items-center gap-1.5 transition-colors"
                        title="Personnaliser l'affichage (ou appui long sur une boîte)"
                    >
                        <FaSliders className="text-[11px]" />
                        <span>Personnaliser</span>
                    </button>
                </div>
            )}

            <div className="columns-1 lg:columns-2 2xl:columns-3 gap-4">
                {visibleBoxes.map((box) => (
                    <BoxChrome
                        key={box.id}
                        box={box}
                        editMode={editMode}
                        drag={editMode ? dragFor(box.id) : null}
                        onLongPress={() => setEditMode(true)}
                        onToggleWidth={layout.toggleWidth}
                        onToggleCollapsed={layout.toggleCollapsed}
                        onHide={layout.toggleVisible}
                        onSetLimit={layout.setLimit}
                        onExpand={layout.toggleCollapsed}
                    >
                        {renderBox(box)}
                    </BoxChrome>
                ))}
            </div>
        </div>
    );
};
