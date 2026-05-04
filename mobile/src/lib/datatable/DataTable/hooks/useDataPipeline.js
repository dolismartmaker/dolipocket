import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Data pipeline for the DataTable.
//
// Two operating modes (cf DATATABLE_SPEC.md §3):
// - mode "client" (mode A): probe count <= clientThreshold, then load
//   everything once via source.list({}). Filtering / sorting / pagination
//   happen in memory.
// - mode "server" (mode B): probe count > clientThreshold, then call
//   source.listPaged({...}) on every change of filters, sort or page. The
//   server returns {items, total, page, limit}.
//
// The decision is made once at mount and recomputed if "remountKey" changes.

const buildAppliedFilters = (filters) => {
    // filters comes from prefs.filters: { search, byColumn }
    return {
        search: filters?.search ?? "",
        byColumn: { ...(filters?.byColumn ?? {}) },
    };
};

const compareValues = (a, b) => {
    if (a === b) return 0;
    if (a === null || a === undefined) return -1;
    if (b === null || b === undefined) return 1;
    if (typeof a === "number" && typeof b === "number") return a - b;
    return String(a).localeCompare(String(b), "fr", { sensitivity: "base" });
};

const matchesText = (value, needle) => {
    if (!needle) return true;
    if (value === null || value === undefined) return false;
    return String(value).toLowerCase().includes(String(needle).toLowerCase());
};

const matchesBoolean = (value, expected) => {
    if (expected === "" || expected === undefined || expected === null) return true;
    const want = String(expected) === "1" || expected === true;
    const has = Number(value) === 1 || value === true;
    return want === has;
};

// Apply column filters in client mode. The format of column filter values
// is whatever the FilterRow stored. Daterange / numberrange are stored as
// {from, to} or {min, max}, text is stored as plain string.
const applyClientFilters = (rows, columns, filters) => {
    const search = filters.search?.trim() ?? "";
    const byColumn = filters.byColumn ?? {};

    let result = rows;

    if (search) {
        const needle = search.toLowerCase();
        result = result.filter((row) => {
            for (const col of columns) {
                if (col.key === "_rownum") continue;
                const v = row[col.key];
                if (v === null || v === undefined) continue;
                if (String(v).toLowerCase().includes(needle)) return true;
            }
            return false;
        });
    }

    for (const [colKey, raw] of Object.entries(byColumn)) {
        if (raw === "" || raw === undefined || raw === null) continue;
        const col = columns.find((c) => c.key === colKey);
        const filterDef = col?.filter;
        const filterKind = typeof filterDef === "string"
            ? filterDef
            : filterDef?.kind;

        if (filterKind === "boolean") {
            result = result.filter((r) => matchesBoolean(r[colKey], raw));
        } else if (filterKind === "daterange") {
            // raw shape: {from, to} as YYYY-MM-DD strings
            const from = raw.from ? Date.parse(raw.from) / 1000 : null;
            const to = raw.to ? (Date.parse(raw.to) / 1000) + 86400 : null;
            result = result.filter((r) => {
                const v = Number(r[colKey] ?? 0);
                if (from !== null && v < from) return false;
                if (to !== null && v > to) return false;
                return true;
            });
        } else if (filterKind === "numberrange") {
            const min = raw.min !== "" && raw.min !== undefined && raw.min !== null
                ? Number(raw.min)
                : null;
            const max = raw.max !== "" && raw.max !== undefined && raw.max !== null
                ? Number(raw.max)
                : null;
            result = result.filter((r) => {
                const v = Number(r[colKey] ?? 0);
                if (min !== null && v < min) return false;
                if (max !== null && v > max) return false;
                return true;
            });
        } else if (filterKind === "select") {
            // exact match
            result = result.filter((r) => String(r[colKey] ?? "") === String(raw));
        } else {
            // default: text contains
            result = result.filter((r) => matchesText(r[colKey], raw));
        }
    }

    return result;
};

const applyClientSort = (rows, sort) => {
    if (!sort || !sort.col) return rows;
    const order = sort.order === "desc" ? -1 : 1;
    const sorted = rows.slice();
    sorted.sort((a, b) => order * compareValues(a[sort.col], b[sort.col]));
    return sorted;
};

// Build the searchParams object passed to source.listPaged().
// Filter values shaped {from,to} -> col_from, col_to. {min,max} -> col_min, col_max.
const buildServerParams = ({ filters, sort, page, limit, columns, includeKeys }) => {
    const params = {};
    if (filters?.search) params.search = filters.search;
    const byColumn = filters?.byColumn ?? {};
    for (const [colKey, raw] of Object.entries(byColumn)) {
        if (raw === "" || raw === undefined || raw === null) continue;
        const col = columns.find((c) => c.key === colKey);
        const filterDef = col?.filter;
        const filterKind = typeof filterDef === "string"
            ? filterDef
            : filterDef?.kind;

        if (filterKind === "daterange") {
            if (raw.from) params[`filter[${colKey}_from]`] = raw.from;
            if (raw.to) params[`filter[${colKey}_to]`] = raw.to;
        } else if (filterKind === "numberrange") {
            if (raw.min !== "" && raw.min !== undefined && raw.min !== null) {
                params[`filter[${colKey}_min]`] = String(raw.min);
            }
            if (raw.max !== "" && raw.max !== undefined && raw.max !== null) {
                params[`filter[${colKey}_max]`] = String(raw.max);
            }
        } else {
            params[`filter[${colKey}]`] = String(raw);
        }
    }
    if (sort?.col) {
        params.sort = sort.col;
        params.order = sort.order === "desc" ? "desc" : "asc";
    }
    if (page) params.page = String(page);
    if (limit) params.limit = String(limit);
    // v2 -- restrict the columns the server has to map. Empty array means
    // "no specific include" (= server default = all mapped columns).
    if (Array.isArray(includeKeys) && includeKeys.length > 0) {
        params.include = includeKeys.join(",");
    }
    return params;
};

export const useDataPipeline = ({
    source,
    resolvedColumns,
    appliedFilters,
    sort,
    page,
    limit,
    clientThreshold = 5000,
    refreshKey = 0,
    includeKeys = null,
}) => {
    const [mode, setMode] = useState(null); // 'client' | 'server' | null
    const [allRows, setAllRows] = useState([]); // mode A only
    const [pageRows, setPageRows] = useState([]); // mode B only
    const [totalForMode, setTotalForMode] = useState(0); // mode A only (= allRows.length)
    const [serverTotal, setServerTotal] = useState(0); // mode B only
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Track the last accepted request to avoid race conditions.
    const requestSeq = useRef(0);

    // Probe count and decide the mode.
    useEffect(() => {
        let cancelled = false;
        const seq = ++requestSeq.current;

        const probe = async () => {
            setLoading(true);
            setError(null);
            try {
                if (typeof source?.count !== "function" || typeof source?.list !== "function") {
                    throw new Error("DataTable dataSource must expose count() and list()");
                }
                const probeRes = await source.count({});
                if (cancelled || seq !== requestSeq.current) return;
                const total = Number(probeRes?.total ?? 0);
                if (total <= clientThreshold) {
                    setMode("client");
                    const rows = await source.list({});
                    if (cancelled || seq !== requestSeq.current) return;
                    const arr = Array.isArray(rows) ? rows : [];
                    setAllRows(arr);
                    setTotalForMode(arr.length);
                } else {
                    setMode("server");
                    setServerTotal(total);
                }
            } catch (err) {
                if (cancelled || seq !== requestSeq.current) return;
                console.error("[DataTable] probe error", err);
                setError(err);
            } finally {
                if (!cancelled && seq === requestSeq.current) {
                    setLoading(false);
                }
            }
        };

        probe();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshKey]);

    // In server mode, refetch the page on any change of filters / sort /
    // page / include. Note: changes to includeKeys also retrigger a fetch
    // so the server can stop mapping fields that are no longer visible.
    useEffect(() => {
        if (mode !== "server") return undefined;
        let cancelled = false;
        const seq = ++requestSeq.current;
        const fetchPage = async () => {
            setLoading(true);
            setError(null);
            try {
                const params = buildServerParams({
                    filters: appliedFilters,
                    sort,
                    page,
                    limit,
                    columns: resolvedColumns,
                    includeKeys,
                });
                const res = await source.listPaged(params);
                if (cancelled || seq !== requestSeq.current) return;
                setPageRows(Array.isArray(res?.items) ? res.items : []);
                setServerTotal(Number(res?.total ?? 0));
            } catch (err) {
                if (cancelled || seq !== requestSeq.current) return;
                console.error("[DataTable] listPaged error", err);
                setError(err);
            } finally {
                if (!cancelled && seq === requestSeq.current) {
                    setLoading(false);
                }
            }
        };
        fetchPage();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, JSON.stringify(appliedFilters), JSON.stringify(sort), page, limit, Array.isArray(includeKeys) ? includeKeys.join(",") : ""]);

    // Client-mode derived rows (filter + sort + slice for the current page).
    const filteredAndSortedClient = useMemo(() => {
        if (mode !== "client") return [];
        const filtered = applyClientFilters(allRows, resolvedColumns, appliedFilters);
        return applyClientSort(filtered, sort);
    }, [mode, allRows, resolvedColumns, appliedFilters, sort]);

    const totalForCurrentFilter = mode === "client"
        ? filteredAndSortedClient.length
        : serverTotal;

    const pageStart = (page - 1) * limit;
    const pageEnd = pageStart + limit;

    const currentPageRows = mode === "client"
        ? filteredAndSortedClient.slice(pageStart, pageEnd)
        : pageRows;

    const refresh = useCallback(() => {
        // Bump refreshKey via parent, but we also expose a self-refresh that
        // re-runs the probe. Done by ++requestSeq + dispatching state updates
        // is tricky; expose a small counter the parent can use. We keep it
        // simple: caller updates refreshKey from the outside.
        return undefined;
    }, []);

    return {
        mode,
        loading,
        error,
        rows: currentPageRows,
        total: totalForCurrentFilter,
        totalUnfiltered: mode === "client" ? totalForMode : serverTotal,
        refresh,
    };
};
