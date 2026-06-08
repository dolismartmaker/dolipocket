import { useEffect, useRef, useState } from "react";
import { FaPlus, FaMagnifyingGlass, FaChevronRight } from "react-icons/fa6";

// Touch-first master list for the tablet master-detail layout.
//
// Generic and feature-agnostic: the caller provides `load({ q, signal })`
// (typically wrapping useDb<Feature>().list), `getKey`, and `renderItem`. The
// component owns the search box (debounced 250ms with abort of stale calls),
// the scroll, the selection highlight and the "+ Nouveau" affordance. Each row
// is a >=56px touch target; tap calls `onSelect(key)` WITHOUT navigating, so
// the surrounding list keeps its state.
//
//   <TouchList
//       title="Tiers"
//       searchPlaceholder="Rechercher un tiers..."
//       load={({ q, signal }) => db.list({ q, perPage: 200, signal })}
//       getKey={(it) => it.id}
//       renderItem={(it) => <TouchListItem primary={it.name} secondary={it.town} />}
//       selectedId={selectedId}
//       onSelect={setSelectedId}
//       onNew={() => navigate("/thirdparties/new")}   // null hides the button
//   />

const SEARCH_DEBOUNCE_MS = 250;

export const TouchList = ({
    title,
    searchPlaceholder = "Rechercher...",
    load,
    getKey,
    renderItem,
    selectedId,
    onSelect,
    onNew,
    reloadToken,
    // Optional client-side filter for features whose list endpoint has no
    // server-side text search (e.g. orders / invoices): (item, qLower) => bool.
    filterItem,
}) => {
    const [q, setQ] = useState("");
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const abortRef = useRef(null);

    useEffect(() => {
        const handle = setTimeout(() => {
            if (abortRef.current) abortRef.current.abort();
            const controller = new AbortController();
            abortRef.current = controller;

            setLoading(true);
            setError(null);
            Promise.resolve(load({ q: q.trim(), signal: controller.signal }))
                .then((rows) => {
                    if (controller.signal.aborted) return;
                    setItems(Array.isArray(rows) ? rows : (rows?.items ?? []));
                })
                .catch((err) => {
                    if (controller.signal.aborted || err?.name === "AbortError") return;
                    console.error("[TouchList] load error", err);
                    setError("Erreur de chargement");
                })
                .finally(() => {
                    if (!controller.signal.aborted) setLoading(false);
                });
        }, SEARCH_DEBOUNCE_MS);

        return () => clearTimeout(handle);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [q, reloadToken]);

    // When a client-side filterItem is provided, narrow the loaded rows by the
    // current query (the server endpoint ignored it). Otherwise the server
    // already filtered, so show everything it returned.
    const trimmedLower = q.trim().toLowerCase();
    const shown = (typeof filterItem === "function" && trimmedLower)
        ? items.filter((it) => filterItem(it, trimmedLower))
        : items;

    return (
        <div className="flex flex-col h-full w-full overflow-hidden">
            {/* Header: title + new */}
            <div className="shrink-0 flex items-center gap-2 px-3 h-14 border-b border-soft-border">
                <h1 className="text-base font-bold text-strong-text flex-1 truncate">{title}</h1>
                {typeof onNew === "function" && (
                    <button
                        type="button"
                        onClick={onNew}
                        className="h-10 px-3 rounded-lg bg-primary text-white text-sm font-semibold flex items-center gap-1.5 active:bg-primary/90"
                    >
                        <FaPlus className="text-xs" />
                        <span>Nouveau</span>
                    </button>
                )}
            </div>

            {/* Search */}
            <div className="shrink-0 px-3 py-2 border-b border-soft-border">
                <div className="relative">
                    <FaMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-soft-text text-sm" />
                    <input
                        type="search"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder={searchPlaceholder}
                        className="w-full h-11 pl-9 pr-3 rounded-lg bg-medium-bg border border-transparent focus:border-primary focus:bg-white outline-none text-sm text-strong-text"
                    />
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
                {loading && items.length === 0 && (
                    <div className="px-4 py-8 text-center text-sm text-soft-text">Chargement...</div>
                )}
                {error && (
                    <div className="px-4 py-8 text-center text-sm text-red-600">{error}</div>
                )}
                {!loading && !error && shown.length === 0 && (
                    <div className="px-4 py-8 text-center text-sm text-soft-text">Aucun résultat</div>
                )}
                <ul>
                    {shown.map((it) => {
                        const key = getKey(it);
                        const selected = key != null && String(key) === String(selectedId);
                        return (
                            <li key={key}>
                                <button
                                    type="button"
                                    onClick={() => onSelect?.(key)}
                                    className={`w-full text-left flex items-center gap-2 px-3 min-h-14 py-2 border-b border-soft-border/60 transition-colors ${
                                        selected
                                            ? "bg-primary/10"
                                            : "active:bg-medium-bg"
                                    }`}
                                >
                                    <div className="flex-1 min-w-0">{renderItem(it, { selected })}</div>
                                    <FaChevronRight className={`text-xs shrink-0 ${selected ? "text-primary" : "text-soft-text/50"}`} />
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </div>
    );
};

// Standard touch list row content. Keeps the 9 features visually consistent.
//   primary   : main line (bold)
//   secondary : muted second line
//   badge     : small pill on the right (e.g. a status label) - string or node
//   amount    : right-aligned strong value (e.g. total TTC)
export const TouchListItem = ({ primary, secondary, badge, amount }) => {
    return (
        <div className="flex items-center gap-2 min-w-0">
            <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-strong-text truncate">{primary || "-"}</div>
                {secondary ? (
                    <div className="text-xs text-soft-text truncate mt-0.5">{secondary}</div>
                ) : null}
            </div>
            <div className="shrink-0 flex flex-col items-end gap-0.5">
                {amount ? (
                    <span className="text-sm font-semibold text-strong-text">{amount}</span>
                ) : null}
                {badge ? (
                    typeof badge === "string"
                        ? <span className="text-[11px] px-1.5 py-0.5 rounded bg-medium-bg text-medium-text">{badge}</span>
                        : badge
                ) : null}
            </div>
        </div>
    );
};
