import {
    FaChartColumn,
    FaFileInvoiceDollar,
    FaTriangleExclamation,
    FaAddressBook,
    FaRegCalendarCheck,
    FaNoteSticky,
    FaGaugeHigh,
} from "react-icons/fa6";

import { CockpitCard } from "./CockpitCard";
import { CaSparkline } from "./CaSparkline";
import { formatCurrency, formatDate, contactName } from "./format";

// Presentational cockpit cards. All are driven by the single cockpit payload
// and self-gate on data.permissions (server truth). While the payload is still
// loading (data === null) a skeleton is shown; once loaded, a card whose block
// is not permitted renders null.
//
// Conventions UI desktop épurées: no shadow on cards (CockpitCard shell only),
// no double-encadrement (inner cells are borderless), density tight,
// transition-colors only, no active:.

const Loading = () => (
    <div className="px-4 py-6 text-center text-soft-text text-[12px]">Chargement...</div>
);

const Empty = ({ children }) => (
    <div className="px-4 py-6 text-center text-soft-text text-[12px]">{children}</div>
);

// Resolve the render state of a permission-gated card.
//   "loading"   payload not yet here
//   "forbidden" payload here but the block is not permitted -> caller returns null
//   "ready"     render the block
const blockState = (data, permKey) => {
    if (!data) return "loading";
    if (permKey && !(data.permissions && data.permissions[permKey])) return "forbidden";
    return "ready";
};

// FR status chip for an invoice row (local, keeps the cockpit i18n-free and
// consistent with its sibling FR-hardcoded sections).
const invoiceStatus = (statut, paye) => {
    if (paye === 1 || statut === 2) return { label: "Payée", cls: "bg-green-100 text-green-800" };
    if (statut === 1) return { label: "Impayée", cls: "bg-amber-100 text-amber-900" };
    if (statut === 3) return { label: "Abandonnée", cls: "bg-gray-100 text-gray-600" };
    return { label: "Brouillon", cls: "bg-gray-100 text-gray-600" };
};

const StatusChip = ({ label, cls }) => (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium shrink-0 ${cls}`}>
        {label}
    </span>
);

// ---- Sales activity (KPI tiles): proposals / orders / invoices / CA ----

const KpiTile = ({ label, value }) => (
    <div className="flex flex-col items-center justify-center gap-0.5 px-2 py-3 text-center">
        <span className="text-lg font-bold text-strong-text tabular-nums leading-none">{value}</span>
        <span className="text-[11px] text-soft-text">{label}</span>
    </div>
);

export const SalesActivityCard = ({ data, loading, currency, onRefresh }) => {
    const state = blockState(data, null);
    if (state === "loading") {
        return (
            <CockpitCard icon={FaGaugeHigh} title="Activité commerciale" onRefresh={onRefresh} loading={loading}>
                <Loading />
            </CockpitCard>
        );
    }

    const perms = data.permissions || {};
    const counts = data.counts || {};
    const tiles = [];
    if (perms.proposal) tiles.push({ label: "Devis", value: counts.proposals ?? 0 });
    if (perms.order) tiles.push({ label: "Commandes", value: counts.orders ?? 0 });
    if (perms.invoice) tiles.push({ label: "Factures", value: counts.invoices ?? 0 });
    if (perms.invoice) tiles.push({ label: "CA cumulé", value: formatCurrency(data.caTotal, currency) });

    if (tiles.length === 0) return null;

    return (
        <CockpitCard icon={FaGaugeHigh} title="Activité commerciale" onRefresh={onRefresh} loading={loading}>
            <div className="grid grid-cols-2 divide-x divide-y divide-soft-border/60">
                {tiles.map((tile) => (
                    <KpiTile key={tile.label} label={tile.label} value={tile.value} />
                ))}
            </div>
        </CockpitCard>
    );
};

// ---- Turnover by year (chart) ----

export const CaChartCard = ({ data, loading, currency, onRefresh }) => {
    const state = blockState(data, "invoice");
    if (state === "forbidden") return null;

    return (
        <CockpitCard icon={FaChartColumn} title="Évolution du chiffre d'affaires" onRefresh={onRefresh} loading={loading}>
            {state === "loading" ? (
                <Loading />
            ) : (
                <div className="px-4 py-3">
                    <CaSparkline data={data.ca} currency={currency} />
                </div>
            )}
        </CockpitCard>
    );
};

// ---- Recent invoices ----

export const RecentInvoicesCard = ({ data, loading, onRowClick, onRefresh, limit = Infinity }) => {
    const state = blockState(data, "invoice");
    if (state === "forbidden") return null;

    const all = state === "ready" ? (data.invoicesRecent || []) : [];
    const rows = Number.isFinite(limit) ? all.slice(0, limit) : all;

    return (
        <CockpitCard
            icon={FaFileInvoiceDollar}
            title="Dernières factures"
            count={state === "ready" ? rows.length : null}
            onRefresh={onRefresh}
            loading={loading}
        >
            {state === "loading" && <Loading />}
            {state === "ready" && rows.length === 0 && <Empty>Aucune facture</Empty>}
            {state === "ready" && rows.length > 0 && (
                <ul className="divide-y divide-soft-border/60">
                    {rows.map((inv) => {
                        const s = invoiceStatus(inv.statut, inv.paye);
                        return (
                            <li key={inv.id}>
                                <button
                                    type="button"
                                    onClick={() => onRowClick?.(inv.id)}
                                    className="w-full text-left flex items-center gap-2 px-4 py-2 hover:bg-medium-bg/50 transition-colors"
                                >
                                    <span className="text-[12px] font-medium text-strong-text truncate flex-1 min-w-0">
                                        {inv.ref || `#${inv.id}`}
                                    </span>
                                    <span className="text-[11px] text-soft-text tabular-nums shrink-0">
                                        {formatDate(inv.date)}
                                    </span>
                                    <span className="text-[12px] font-medium text-strong-text tabular-nums shrink-0">
                                        {formatCurrency(inv.totalTtc, data.currency)}
                                    </span>
                                    <StatusChip label={s.label} cls={s.cls} />
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </CockpitCard>
    );
};

// ---- Unpaid invoices ----

export const UnpaidInvoicesCard = ({ data, loading, onRowClick, onRefresh, limit = Infinity }) => {
    const state = blockState(data, "invoice");
    if (state === "forbidden") return null;

    const all = state === "ready" ? (data.invoicesUnpaid || []) : [];
    const rows = Number.isFinite(limit) ? all.slice(0, limit) : all;
    // Total due always reflects the full returned set, not the displayed slice.
    const total = state === "ready" ? data.unpaidTotal : 0;

    return (
        <CockpitCard
            icon={FaTriangleExclamation}
            title="Factures impayées"
            count={state === "ready" ? rows.length : null}
            onRefresh={onRefresh}
            loading={loading}
        >
            {state === "loading" && <Loading />}
            {state === "ready" && rows.length === 0 && <Empty>Aucune facture impayée</Empty>}
            {state === "ready" && rows.length > 0 && (
                <>
                    <div className="px-4 py-2 border-b border-soft-border bg-amber-50 flex items-center justify-between">
                        <span className="text-[12px] text-amber-900">Total dû</span>
                        <span className="text-[13px] font-bold text-amber-900 tabular-nums">
                            {formatCurrency(total, data.currency)}
                        </span>
                    </div>
                    <ul className="divide-y divide-soft-border/60">
                        {rows.map((inv) => (
                            <li key={inv.id}>
                                <button
                                    type="button"
                                    onClick={() => onRowClick?.(inv.id)}
                                    className="w-full text-left flex items-center gap-2 px-4 py-2 hover:bg-medium-bg/50 transition-colors"
                                >
                                    <span className="text-[12px] font-medium text-strong-text truncate flex-1 min-w-0">
                                        {inv.ref || `#${inv.id}`}
                                    </span>
                                    <span className="text-[11px] text-soft-text tabular-nums shrink-0">
                                        échéance {formatDate(inv.dateLim)}
                                    </span>
                                    <span className="text-[12px] font-medium text-strong-text tabular-nums shrink-0">
                                        {formatCurrency(inv.totalTtc, data.currency)}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </CockpitCard>
    );
};

// ---- Contacts ----

export const ContactsCard = ({ data, loading, onRowClick, onRefresh, limit = Infinity }) => {
    const state = blockState(data, "contact");
    if (state === "forbidden") return null;

    const all = state === "ready" ? (data.contactsRecent || []) : [];
    const rows = Number.isFinite(limit) ? all.slice(0, limit) : all;
    const count = state === "ready" ? (data.counts?.contacts ?? rows.length) : null;

    return (
        <CockpitCard
            icon={FaAddressBook}
            title="Contacts"
            count={count}
            onRefresh={onRefresh}
            loading={loading}
        >
            {state === "loading" && <Loading />}
            {state === "ready" && rows.length === 0 && <Empty>Aucun contact</Empty>}
            {state === "ready" && rows.length > 0 && (
                <ul className="divide-y divide-soft-border/60">
                    {rows.map((c) => {
                        const phone = c.phoneMobile || c.phonePro || "";
                        return (
                            <li key={c.id}>
                                <button
                                    type="button"
                                    onClick={() => onRowClick?.(c.id)}
                                    className="w-full text-left flex items-center gap-2 px-4 py-2 hover:bg-medium-bg/50 transition-colors"
                                >
                                    <span className="text-[12px] font-medium text-strong-text truncate flex-1 min-w-0">
                                        {contactName(c)}
                                    </span>
                                    {c.email && (
                                        <span className="text-[11px] text-soft-text truncate max-w-[45%]">{c.email}</span>
                                    )}
                                    {phone && (
                                        <span className="text-[11px] text-soft-text tabular-nums shrink-0">{phone}</span>
                                    )}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </CockpitCard>
    );
};

// ---- Recent agenda events ----

export const EventsCard = ({ data, loading, onRowClick, onRefresh, limit = Infinity }) => {
    const state = blockState(data, "agenda");
    if (state === "forbidden") return null;

    const all = state === "ready" ? (data.events || []) : [];
    const rows = Number.isFinite(limit) ? all.slice(0, limit) : all;

    return (
        <CockpitCard
            icon={FaRegCalendarCheck}
            title="Derniers événements"
            count={state === "ready" ? rows.length : null}
            onRefresh={onRefresh}
            loading={loading}
        >
            {state === "loading" && <Loading />}
            {state === "ready" && rows.length === 0 && <Empty>Aucun événement</Empty>}
            {state === "ready" && rows.length > 0 && (
                <ul className="divide-y divide-soft-border/60">
                    {rows.map((ev) => (
                        <li key={ev.id}>
                            <button
                                type="button"
                                onClick={() => onRowClick?.(ev.id)}
                                className="w-full text-left flex items-center gap-2 px-4 py-2 hover:bg-medium-bg/50 transition-colors"
                            >
                                <span className="text-[12px] text-strong-text truncate flex-1 min-w-0">
                                    {ev.label || "(sans titre)"}
                                </span>
                                <span className="text-[11px] text-soft-text tabular-nums shrink-0">
                                    {formatDate(ev.date)}
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </CockpitCard>
    );
};

// ---- Notes (from the already loaded thirdparty item) ----

export const NotesCard = ({ item }) => {
    const note = (item?.notePublic || "").trim();
    if (!note) return null;

    return (
        <CockpitCard icon={FaNoteSticky} title="Notes">
            <div className="px-4 py-3 text-[13px] text-strong-text whitespace-pre-line break-words">
                {note}
            </div>
        </CockpitCard>
    );
};
