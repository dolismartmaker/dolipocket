import { useState, useEffect, useRef, useCallback } from "react";
import { FaSearch, FaTimes, FaChevronRight, FaPlus } from "react-icons/fa";

import { useApi } from "@cap-rel/smartcommon";

/**
 * SearchPicker - Reusable search-and-select component.
 *
 * Props:
 *   label       {string}      - Field label
 *   value       {number|null} - Currently selected ID (0 or null = nothing selected)
 *   onChange    {function}     - Called with (id, item) when selection changes
 *   endpoint   {string}       - API endpoint for search (e.g. "thirdparty", "contact")
 *   searchKey  {string}       - Query parameter name for search (default: "q")
 *   renderItem {function}     - (item) => { title, subtitle } for display
 *   displayValue {string}     - Text to show for the currently selected item (optional)
 *   placeholder {string}      - Placeholder when nothing selected
 *   clearable  {boolean}      - Allow clearing the selection (default: true)
 *   required   {boolean}      - Show required indicator
 *   disabled   {boolean}      - Disable the picker
 *   filters    {object}       - Extra query parameters for the search
 *   onCreateNew {function}   - If provided, shows a "+" button to create a new item
 *   createLabel {string}     - Label for the create button (default: "Creer")
 */
export const SearchPicker = ({
    label,
    value,
    onChange,
    endpoint,
    searchKey = "q",
    renderItem,
    displayValue,
    placeholder = "Rechercher...",
    clearable = true,
    required = false,
    disabled = false,
    filters = {},
    onCreateNew,
    createLabel = "Creer",
}) => {
    const { get } = useApi();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [selectedLabel, setSelectedLabel] = useState(displayValue || "");
    const inputRef = useRef(null);
    const debounceRef = useRef(null);

    // Update selectedLabel when displayValue prop changes
    useEffect(() => {
        if (displayValue !== undefined) {
            setSelectedLabel(displayValue);
        }
    }, [displayValue]);

    // Load the selected item label on mount if we have a value but no displayValue
    useEffect(() => {
        if (value && value > 0 && !displayValue && get) {
            loadSelectedItem();
        }
    }, [value, get]);

    const loadSelectedItem = async () => {
        try {
            const data = await get(`${endpoint}/${value}`);
            if (data) {
                const rendered = renderItem(data);
                setSelectedLabel(rendered.title || "");
            }
        } catch {
            setSelectedLabel(`#${value}`);
        }
    };

    const doSearch = useCallback(
        async (q) => {
            if (!get) return;

            setSearching(true);
            try {
                const params = { page: 1, limit: 20, ...filters };
                if (q.trim()) {
                    params[searchKey] = q.trim();
                }
                const data = await get(endpoint, { searchParams: params });
                setResults(data?.items ?? []);
            } catch (err) {
                console.error("SearchPicker search error", err);
                setResults([]);
            } finally {
                setSearching(false);
            }
        },
        [get, endpoint, searchKey, filters]
    );

    // Debounced search
    useEffect(() => {
        if (!open) return;

        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        debounceRef.current = setTimeout(() => {
            doSearch(query);
        }, 300);

        return () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
        };
    }, [query, open, doSearch]);

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
        const rendered = renderItem(item);
        setSelectedLabel(rendered.title || "");
        onChange(item.id, item);
        handleClose();
    };

    const handleClear = (e) => {
        e.stopPropagation();
        setSelectedLabel("");
        onChange(0, null);
    };

    const hasValue = value && value > 0;

    return (
        <>
            {/* Field display */}
            <div className="flex flex-col gap-1">
                {label && (
                    <label className="text-sm font-medium text-gray-600">
                        {label}
                        {required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                )}
                <button
                    type="button"
                    onClick={handleOpen}
                    disabled={disabled}
                    className={`w-full text-left bg-white p-3 rounded-lg border border-gray-200 flex items-center gap-2 ${
                        disabled ? "opacity-50 cursor-not-allowed" : "active:bg-gray-50"
                    }`}
                >
                    <FaSearch className="text-gray-400 flex-shrink-0 text-sm" />
                    <span className={`flex-1 truncate ${hasValue ? "text-gray-900" : "text-gray-400"}`}>
                        {hasValue ? selectedLabel || `#${value}` : placeholder}
                    </span>
                    {hasValue && clearable && !disabled && (
                        <span
                            role="button"
                            tabIndex={0}
                            onClick={handleClear}
                            onKeyDown={(e) => e.key === "Enter" && handleClear(e)}
                            className="text-gray-400 hover:text-gray-600 p-1"
                        >
                            <FaTimes className="text-xs" />
                        </span>
                    )}
                    {!hasValue && (
                        <FaChevronRight className="text-gray-400 flex-shrink-0 text-xs" />
                    )}
                </button>
            </div>

            {/* Search modal */}
            {open && (
                <div className="fixed inset-0 z-50 flex flex-col bg-white">
                    {/* Modal header with search */}
                    <div className="bg-gradient-to-r from-primary to-secondary p-4 text-white">
                        <div className="flex items-center gap-3">
                            <button onClick={handleClose} className="p-2 -ml-2">
                                <FaTimes />
                            </button>
                            <div className="flex-1">
                                <h2 className="font-bold">{label || "Rechercher"}</h2>
                            </div>
                            {onCreateNew && (
                                <button
                                    onClick={() => { handleClose(); onCreateNew(); }}
                                    className="p-2 bg-white/20 rounded-full"
                                    aria-label={createLabel}
                                    title={createLabel}
                                >
                                    <FaPlus />
                                </button>
                            )}
                        </div>
                        <div className="mt-3 relative">
                            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                ref={inputRef}
                                type="search"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder={placeholder}
                                autoFocus
                                className="w-full pl-10 pr-3 py-2 rounded-lg text-gray-800 bg-white focus:outline-none"
                            />
                        </div>
                    </div>

                    {/* Results */}
                    <div className="flex-1 overflow-y-auto">
                        {searching && results.length === 0 && (
                            <div className="text-center text-gray-500 py-8">Recherche...</div>
                        )}

                        {!searching && results.length === 0 && query.trim() !== "" && (
                            <div className="text-center text-gray-500 py-8">
                                <div>Aucun resultat</div>
                                {onCreateNew && (
                                    <button
                                        type="button"
                                        onClick={() => { handleClose(); onCreateNew(); }}
                                        className="mt-3 px-4 py-2 bg-primary text-white rounded-lg inline-flex items-center gap-2 font-medium"
                                    >
                                        <FaPlus className="text-sm" />
                                        {createLabel}
                                    </button>
                                )}
                            </div>
                        )}

                        {!searching && results.length === 0 && query.trim() === "" && (
                            <div className="text-center text-gray-400 py-8 text-sm">
                                Tapez pour rechercher
                            </div>
                        )}

                        <ul className="divide-y divide-gray-100">
                            {results.map((item) => {
                                const rendered = renderItem(item);
                                const isSelected = item.id === value;
                                return (
                                    <li key={item.id}>
                                        <button
                                            type="button"
                                            onClick={() => handleSelect(item)}
                                            className={`w-full text-left p-4 active:bg-gray-50 flex items-center gap-3 ${
                                                isSelected ? "bg-primary/5" : ""
                                            }`}
                                        >
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium text-gray-800 truncate">
                                                    {rendered.title}
                                                </div>
                                                {rendered.subtitle && (
                                                    <div className="text-sm text-gray-500 truncate">
                                                        {rendered.subtitle}
                                                    </div>
                                                )}
                                            </div>
                                            {isSelected && (
                                                <div className="text-primary font-bold text-sm">
                                                    Selectionne
                                                </div>
                                            )}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                </div>
            )}
        </>
    );
};
