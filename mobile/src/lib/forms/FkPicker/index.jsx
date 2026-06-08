import { useCallback, useEffect, useRef, useState } from "react";
import { FaMagnifyingGlass, FaXmark, FaChevronRight } from "react-icons/fa6";

import { useApi } from "@cap-rel/smartcommon";

import { useViewport } from "src/lib/viewport";

// <FkPicker>
//
// Foreign-key picker used by <AutoForm> and any page that needs to resolve
// a Dolibarr id by searching against a paginated REST endpoint. Drop-in
// replacement for the mobile <SearchPicker>: same prop surface for
// `endpoint`, `value`, `onChange`, `renderItem`, `placeholder`, `clearable`,
// `disabled`, `required`, `filters`. Adds:
//
//   - Viewport-aware UI: bottom-up sheet on mobile, anchored popover on
//     desktop (no fullscreen modal that would dwarf the form).
//   - `searchKey` defaults to "search" (the canonical paginated query
//     parameter). Pass searchKey="q" to hit a legacy endpoint.
//
// Purely controlled: `value` (numeric id, 0 = nothing selected) and
// `onChange(id)` are mandatory. <AutoForm> wires them against its internal
// `useForm` state (smartcommon's FormContext is not exported from the bundle
// so FkPicker cannot tap into it directly).
//
// No JSX is hardcoded per target type: the same component drives every FK
// (Societe, Contact, Product, Project, User, Warehouse, ...). Visual style
// follows the desktop "épuré" conventions (no shadow-sm on the trigger, no
// gradient header on desktop, no rounded-2xl).

const DEFAULT_RENDER_ITEM = (item) => ({
    title:
        item?.label
        || item?.name
        || item?.nom
        || item?.ref
        || item?.fullname
        || item?.lastname
        || item?.login
        || `#${item?.id ?? ""}`,
    subtitle:
        [item?.town, item?.countryCode || item?.country_code].filter(Boolean).join(", ")
        || item?.email
        || item?.code
        || "",
});

export const FkPicker = (props) => {
    const {
        label,
        value,
        onChange,
        endpoint,
        searchKey = "search",
        renderItem = DEFAULT_RENDER_ITEM,
        placeholder = "Rechercher...",
        clearable = true,
        required = false,
        disabled = false,
        filters,
    } = props;

    const currentValue = value;

    const setValue = (id) => {
        if (typeof onChange === "function") {
            onChange(id);
        }
    };

    const { get } = useApi();
    const { isDesktop, isTablet } = useViewport();
    const isMobile = !isDesktop && !isTablet;

    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [selectedLabel, setSelectedLabel] = useState("");
    const debounceRef = useRef(null);
    const popoverRef = useRef(null);
    const triggerRef = useRef(null);

    // Stable filters reference: turn into a stable JSON string so the search
    // effect does not refire on every render due to a fresh object literal
    // passed as prop.
    const filtersJson = filters ? JSON.stringify(filters) : "";

    // Resolve label for the currently selected id (mount + value change).
    useEffect(() => {
        let cancelled = false;
        if (!currentValue || Number(currentValue) <= 0 || !get) {
            setSelectedLabel("");
            return undefined;
        }
        get(`${endpoint}/${currentValue}`)
            .then((data) => {
                if (cancelled) return;
                const r = renderItem(data);
                setSelectedLabel(r?.title ?? `#${currentValue}`);
            })
            .catch(() => {
                if (cancelled) return;
                setSelectedLabel(`#${currentValue}`);
            });
        return () => { cancelled = true; };
    }, [currentValue, endpoint, get, renderItem]);

    const doSearch = useCallback(
        async (q) => {
            if (!get) return;
            setSearching(true);
            try {
                const params = { page: 1, limit: 20 };
                if (filtersJson) Object.assign(params, JSON.parse(filtersJson));
                const trimmed = q.trim();
                if (trimmed !== "") params[searchKey] = trimmed;
                const data = await get(endpoint, { searchParams: params });
                // Accept paginated envelope OR raw array (legacy).
                const items = Array.isArray(data?.items)
                    ? data.items
                    : Array.isArray(data) ? data : [];
                setResults(items);
            } catch (err) {
                console.error("[FkPicker] search error", { endpoint, err });
                setResults([]);
            } finally {
                setSearching(false);
            }
        },
        [get, endpoint, searchKey, filtersJson],
    );

    // Debounced search while the picker is open.
    useEffect(() => {
        if (!open) return undefined;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => { doSearch(query); }, 250);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [query, open, doSearch]);

    // Click-outside dismiss for the desktop popover.
    useEffect(() => {
        if (!open || !isDesktop) return undefined;
        const onDown = (e) => {
            if (
                popoverRef.current
                && !popoverRef.current.contains(e.target)
                && triggerRef.current
                && !triggerRef.current.contains(e.target)
            ) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [open, isDesktop]);

    const handleOpen = () => {
        if (disabled) return;
        setOpen(true);
        setQuery("");
        setResults([]);
    };

    const handleClose = () => {
        setOpen(false);
        setQuery("");
        setResults([]);
    };

    const handleSelect = (item) => {
        const r = renderItem(item);
        setSelectedLabel(r?.title ?? `#${item?.id ?? ""}`);
        setValue(Number(item?.id ?? 0));
        handleClose();
    };

    const handleClear = (e) => {
        e.stopPropagation();
        setSelectedLabel("");
        setValue(0);
    };

    const hasValue = Number(currentValue) > 0;
    const displayed = hasValue
        ? (selectedLabel || `#${currentValue}`)
        : placeholder;

    const triggerClass = isDesktop
        ? "min-w-0 w-full text-left bg-soft-bg p-2 rounded-app-md border border-border flex items-center gap-2 hover:border-soft-border/80 disabled:opacity-50"
        : "w-full text-left bg-white p-3 rounded-lg border border-gray-200 flex items-center gap-2 active:bg-gray-50 disabled:opacity-50";

    return (
        <div className="flex flex-col gap-1 relative">
            {label ? (
                <label className="text-sm font-medium text-strong-text">
                    {label}
                    {required ? <span className="text-red-600 ml-1">*</span> : null}
                </label>
            ) : null}

            <button
                ref={triggerRef}
                type="button"
                onClick={handleOpen}
                disabled={disabled}
                className={triggerClass}
            >
                <FaMagnifyingGlass className="text-soft-text shrink-0 text-sm" />
                <span className={`flex-1 truncate ${hasValue ? "text-strong-text" : "text-soft-text"}`}>
                    {displayed}
                </span>
                {hasValue && clearable && !disabled ? (
                    <span
                        role="button"
                        tabIndex={0}
                        onClick={handleClear}
                        onKeyDown={(e) => e.key === "Enter" && handleClear(e)}
                        className="text-soft-text hover:text-strong-text p-1"
                    >
                        <FaXmark className="text-xs" />
                    </span>
                ) : null}
                {!hasValue ? (
                    <FaChevronRight className="text-soft-text shrink-0 text-xs" />
                ) : null}
            </button>

            {open && isDesktop ? (
                <div
                    ref={popoverRef}
                    className="absolute z-30 left-0 right-0 top-full mt-1 rounded-md border border-soft-border bg-white shadow-lg max-h-80 flex flex-col overflow-hidden"
                >
                    <div className="p-2 border-b border-soft-border">
                        <input
                            autoFocus
                            type="search"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={placeholder}
                            className="w-full px-2 py-1.5 text-sm rounded border border-soft-border focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>
                    <div className="overflow-auto">
                        <ResultsList
                            searching={searching}
                            results={results}
                            query={query}
                            value={currentValue}
                            renderItem={renderItem}
                            onSelect={handleSelect}
                            compact
                        />
                    </div>
                </div>
            ) : null}

            {open && isTablet ? (
                <>
                    {/* Tablet: centered touch modal (wide enough for landscape,
                        not a fullscreen sheet that would dwarf the form). */}
                    <div className="fixed inset-0 z-50 bg-black/30" onClick={handleClose} />
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 pointer-events-none">
                        <div className="pointer-events-auto w-full max-w-lg max-h-[70vh] bg-white rounded-xl border border-soft-border shadow-lg flex flex-col overflow-hidden">
                            <div className="p-3 border-b border-soft-border flex items-center gap-3">
                                <h2 className="font-semibold text-strong-text flex-1 truncate">{label || "Rechercher"}</h2>
                                <button onClick={handleClose} className="p-2 -mr-2 text-soft-text active:text-strong-text" aria-label="Fermer">
                                    <FaXmark />
                                </button>
                            </div>
                            <div className="p-3 border-b border-soft-border relative">
                                <FaMagnifyingGlass className="absolute left-6 top-1/2 -translate-y-1/2 text-soft-text text-sm" />
                                <input
                                    autoFocus
                                    type="search"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder={placeholder}
                                    className="w-full h-11 pl-9 pr-3 rounded-lg bg-medium-bg border border-transparent focus:border-primary focus:bg-white outline-none text-sm text-strong-text"
                                />
                            </div>
                            <div className="flex-1 overflow-y-auto">
                                <ResultsList
                                    searching={searching}
                                    results={results}
                                    query={query}
                                    value={currentValue}
                                    renderItem={renderItem}
                                    onSelect={handleSelect}
                                    compact={false}
                                />
                            </div>
                        </div>
                    </div>
                </>
            ) : null}

            {open && isMobile ? (
                <div className="fixed inset-0 z-50 flex flex-col bg-white">
                    <div className="bg-linear-to-r from-primary to-secondary p-4 text-white">
                        <div className="flex items-center gap-3">
                            <button onClick={handleClose} className="p-2 -ml-2" aria-label="Fermer">
                                <FaXmark />
                            </button>
                            <h2 className="font-bold flex-1 truncate">{label || "Rechercher"}</h2>
                        </div>
                        <div className="mt-3 relative">
                            <FaMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-soft-text" />
                            <input
                                autoFocus
                                type="search"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder={placeholder}
                                className="w-full pl-10 pr-3 py-2 rounded-lg text-strong-text bg-white focus:outline-none"
                            />
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        <ResultsList
                            searching={searching}
                            results={results}
                            query={query}
                            value={currentValue}
                            renderItem={renderItem}
                            onSelect={handleSelect}
                            compact={false}
                        />
                    </div>
                </div>
            ) : null}
        </div>
    );
};

const ResultsList = ({ searching, results, query, value, renderItem, onSelect, compact }) => {
    if (searching && results.length === 0) {
        return <div className="text-center text-soft-text py-6 text-sm">Recherche...</div>;
    }
    if (!searching && results.length === 0 && query.trim() !== "") {
        return <div className="text-center text-soft-text py-6 text-sm">Aucun résultat</div>;
    }
    if (!searching && results.length === 0 && query.trim() === "") {
        return <div className="text-center text-soft-text py-6 text-sm">Tapez pour rechercher</div>;
    }

    return (
        <ul className="divide-y divide-soft-border/60">
            {results.map((item) => {
                const r = renderItem(item) ?? {};
                const isSelected = Number(item?.id) === Number(value);
                return (
                    <li key={item.id}>
                        <button
                            type="button"
                            onClick={() => onSelect(item)}
                            className={`w-full text-left ${compact ? "p-2" : "p-4"} hover:bg-medium-bg/50 flex items-center gap-3 ${
                                isSelected ? "bg-primary/5" : ""
                            }`}
                        >
                            <div className="flex-1 min-w-0">
                                <div className={`font-medium text-strong-text truncate ${compact ? "text-sm" : ""}`}>
                                    {r.title}
                                </div>
                                {r.subtitle ? (
                                    <div className={`text-soft-text truncate ${compact ? "text-xs" : "text-sm"}`}>
                                        {r.subtitle}
                                    </div>
                                ) : null}
                            </div>
                            {isSelected ? (
                                <div className="text-primary font-bold text-xs shrink-0">Sélectionné</div>
                            ) : null}
                        </button>
                    </li>
                );
            })}
        </ul>
    );
};
