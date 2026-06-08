<?php

/**
 * Copyright (c) 2026 Eric Seigne <eric.seigne@cap-rel.fr>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 */

namespace Dolipocket\Api\Trait;

/**
 * Generic helper for paginated/filtered/sortable list endpoints.
 *
 * Implements the contract described in docs/DATATABLE_SPEC.md sections 4.1-4.4
 * and 4.6:
 *
 *  - Parses query-string parameters: search, filter[col], sort, order, page, limit.
 *  - Builds a safe SQL WHERE clause from a filter map (text/select/daterange/
 *    numberrange/boolean) plus a global LIKE search across a whitelist of fields.
 *  - Builds an ORDER BY clause from a sortable map (whitelist).
 *  - Backward compatibility: hasListParams() lets controllers detect when no
 *    pagination/filter param is present so they can return the legacy raw array.
 *
 * Every value injected into SQL goes through DoliDB::escape() (or is cast to int),
 * so this trait does not concatenate raw user input into the query.
 *
 * Filters that are not in the supplied $filterMap are silently ignored at the
 * SQL level but logged via dol_syslog(LOG_INFO) for observability.
 *
 * Consumers must already have a $db variable (DoliDB) in scope.
 */
trait PaginatedListTrait
{
    /**
     * Normalise an incoming date/timestamp value to a Unix timestamp in
     * SECONDS (Dolibarr's expected format for $object->date / ->datep / ...).
     *
     * Accepted inputs:
     *   - int/numeric string in seconds  (10 digits, e.g. 1777939200)
     *     -> returned as-is (cast to int)
     *   - int/numeric string in milliseconds (13+ digits, e.g. 1777939200000)
     *     -> divided by 1000. This is what the AutoForm front sends because
     *        smartcommon Input type="date" stores values via Date.getTime().
     *   - ISO-ish string ("2026-06-15", "2026-06-15T10:30") -> strtotime()
     *   - empty / null / false -> null (caller decides on a default)
     *
     * Without this helper every document controller forwarded ms straight
     * into Dolibarr, yielding "Bad value 1777939200000 for date" SQL
     * crashes (cf prod log 2026-05-05 12:58 + DocumentCreateSqlSafetyTest).
     *
     * @param   mixed  $value
     * @return  int|null  Unix timestamp in seconds, or null when input is empty.
     */
    protected static function normalizeTimestamp($value)
    {
        if ($value === null || $value === '' || $value === false) {
            return null;
        }
        if (is_numeric($value)) {
            $n = (int) $value;
            // 13+ digits -> milliseconds. We keep a generous threshold so a
            // future Date.now() call (currently ~1.7e12, growing) still
            // matches as ms while a pre-2286 seconds-since-epoch (currently
            // ~1.7e9) stays under it.
            if ($n > 99999999999) { // 11 digits or more -> ms
                return intdiv($n, 1000);
            }
            return $n;
        }
        if (is_string($value)) {
            $ts = strtotime($value);
            return $ts === false ? null : $ts;
        }
        return null;
    }

    /**
     * Parse pagination/filter parameters from the input array.
     *
     * Normalizes inputs:
     *   - search : trimmed string (default '')
     *   - filter : associative array of column => raw value (always an array,
     *              missing or non-array input becomes []).
     *   - sort   : trimmed string (default '')
     *   - order  : 'asc' or 'desc' (case-insensitive input, default 'asc')
     *   - page   : int >= 1 (default 1)
     *   - limit  : int clamped to [1, 100] (default 50)
     *
     * @param array<string,mixed>|null $arr Raw query parameters (typically $_GET-derived).
     * @return array{search:string,filter:array<string,mixed>,sort:string,order:string,page:int,limit:int,offset:int}
     */
    protected function parseListParams($arr)
    {
        $arr = is_array($arr) ? $arr : [];

        $search = isset($arr['search']) ? trim((string) $arr['search']) : '';

        $filter = [];
        if (isset($arr['filter']) && is_array($arr['filter'])) {
            foreach ($arr['filter'] as $k => $v) {
                $filter[(string) $k] = $v;
            }
        }

        $sort = isset($arr['sort']) ? trim((string) $arr['sort']) : '';

        $order = 'asc';
        if (isset($arr['order'])) {
            $candidate = strtolower(trim((string) $arr['order']));
            if ($candidate === 'desc') {
                $order = 'desc';
            } elseif ($candidate === 'asc') {
                $order = 'asc';
            }
            // any other value falls back to default 'asc'
        }

        $page = isset($arr['page']) ? (int) $arr['page'] : 1;
        if ($page < 1) {
            $page = 1;
        }

        $limit = isset($arr['limit']) ? (int) $arr['limit'] : 50;
        if ($limit < 1) {
            $limit = 1;
        } elseif ($limit > 100) {
            $limit = 100;
        }

        $offset = ($page - 1) * $limit;

        return [
            'search' => $search,
            'filter' => $filter,
            'sort'   => $sort,
            'order'  => $order,
            'page'   => $page,
            'limit'  => $limit,
            'offset' => $offset,
        ];
    }

    /**
     * Detect whether the request carries any list/pagination parameter.
     *
     * Used to keep backward compatibility (cf DATATABLE_SPEC.md section 4.3):
     * when no list param is present, controllers may keep returning the legacy
     * raw array instead of the {items,total,page,limit} envelope.
     *
     * @param array<string,mixed>|null $arr Raw input.
     * @return bool True when at least one of search/filter/sort/page/limit is set.
     */
    protected function hasListParams($arr)
    {
        if (!is_array($arr)) {
            return false;
        }
        if (isset($arr['search']) && (string) $arr['search'] !== '') {
            return true;
        }
        if (isset($arr['filter']) && is_array($arr['filter']) && !empty($arr['filter'])) {
            return true;
        }
        if (isset($arr['sort']) && (string) $arr['sort'] !== '') {
            return true;
        }
        if (isset($arr['page'])) {
            return true;
        }
        if (isset($arr['limit'])) {
            return true;
        }
        return false;
    }

    /**
     * Build a SQL WHERE fragment from the parsed filters and global search.
     *
     * The returned SQL fragment starts with " AND ..." (or '' if no condition)
     * and is meant to be appended to a query that already has a base WHERE
     * clause (typically "WHERE entity IN (...)").
     *
     * Filter kinds supported (case-insensitive):
     *   - 'text'         : LIKE '%value%' on the mapped SQL column.
     *   - 'select'       : exact equality (string or int auto-detected).
     *   - 'daterange'    : reads filter[<col>_from] and filter[<col>_to] as
     *                      'YYYY-MM-DD'. Non-matching values are ignored.
     *   - 'numberrange'  : reads filter[<col>_min] and filter[<col>_max] as
     *                      floats. Non-numeric values are ignored.
     *   - 'boolean'      : '0' or '1' produces an exact match. Anything else
     *                      is ignored (= 'all' state).
     *
     * Filters absent from $filterMap are ignored at the SQL level. They are
     * logged at LOG_INFO so a developer can spot a typo without breaking the
     * request.
     *
     * @param array<string,mixed>          $params      Output of parseListParams().
     * @param array<string,array{column:string,kind:string}> $filterMap   Filter whitelist.
     * @param array<int,string>            $searchFields SQL column list for the global LIKE search.
     * @return array{0:string,1:array<int,mixed>} Tuple [whereSql, sqlParams]. sqlParams
     *                                            currently always empty (values are
     *                                            inlined after escape()), but kept for
     *                                            forward compat with prepared statements.
     */
    protected function buildSqlFilters(array $params, array $filterMap, array $searchFields)
    {
        global $db;

        $where = '';
        $sqlParams = [];

        // Global multi-field search (LIKE OR ...).
        $search = isset($params['search']) ? (string) $params['search'] : '';
        if ($search !== '' && !empty($searchFields)) {
            $likeEscaped = $db->escape($search);
            $orParts = [];
            foreach ($searchFields as $col) {
                // Column names are developer-controlled, not user-controlled,
                // so we accept them as-is. We still cast to string for safety.
                $orParts[] = (string) $col." LIKE '%".$likeEscaped."%'";
            }
            if (!empty($orParts)) {
                $where .= " AND (".implode(' OR ', $orParts).")";
            }
        }

        // Per-column filters.
        $filters = isset($params['filter']) && is_array($params['filter']) ? $params['filter'] : [];

        // First, detect filters whose key is not whitelisted so we can log them once.
        // Range filters use suffixes _from/_to/_min/_max, so we tolerate those.
        foreach ($filters as $key => $val) {
            $base = (string) $key;
            $known = isset($filterMap[$base]);
            if (!$known) {
                // Try stripping known suffixes
                foreach (['_from', '_to', '_min', '_max'] as $suf) {
                    $sufLen = strlen($suf);
                    if (strlen($base) > $sufLen && substr($base, -$sufLen) === $suf) {
                        $stripped = substr($base, 0, -$sufLen);
                        if (isset($filterMap[$stripped])) {
                            $known = true;
                            break;
                        }
                    }
                }
            }
            if (!$known) {
                dol_syslog(
                    "DPK PaginatedListTrait::buildSqlFilters ignoring unknown filter key '".$base."'",
                    LOG_INFO
                );
            }
        }

        foreach ($filterMap as $apiCol => $def) {
            if (!is_array($def) || !isset($def['column'], $def['kind'])) {
                dol_syslog(
                    "DPK PaginatedListTrait::buildSqlFilters skipping malformed filter map entry for '".(string) $apiCol."'",
                    LOG_WARNING
                );
                continue;
            }
            $sqlCol = (string) $def['column'];
            $kind = strtolower((string) $def['kind']);

            switch ($kind) {
                case 'text':
                    if (isset($filters[$apiCol]) && (string) $filters[$apiCol] !== '') {
                        $val = $db->escape((string) $filters[$apiCol]);
                        $where .= " AND ".$sqlCol." LIKE '%".$val."%'";
                    }
                    break;

                case 'select':
                    if (isset($filters[$apiCol]) && (string) $filters[$apiCol] !== '') {
                        $raw = (string) $filters[$apiCol];
                        if (is_numeric($raw)) {
                            // Numeric values: cast to int or float depending on dot.
                            if (strpos($raw, '.') !== false) {
                                $where .= " AND ".$sqlCol." = ".(float) $raw;
                            } else {
                                $where .= " AND ".$sqlCol." = ".(int) $raw;
                            }
                        } else {
                            $val = $db->escape($raw);
                            $where .= " AND ".$sqlCol." = '".$val."'";
                        }
                    }
                    break;

                case 'daterange':
                    $from = isset($filters[$apiCol.'_from']) ? (string) $filters[$apiCol.'_from'] : '';
                    $to = isset($filters[$apiCol.'_to']) ? (string) $filters[$apiCol.'_to'] : '';
                    if ($from !== '' && self::isIsoDate($from)) {
                        $where .= " AND ".$sqlCol." >= '".$db->escape($from." 00:00:00")."'";
                    }
                    if ($to !== '' && self::isIsoDate($to)) {
                        $where .= " AND ".$sqlCol." <= '".$db->escape($to." 23:59:59")."'";
                    }
                    break;

                case 'numberrange':
                    $min = isset($filters[$apiCol.'_min']) ? $filters[$apiCol.'_min'] : null;
                    $max = isset($filters[$apiCol.'_max']) ? $filters[$apiCol.'_max'] : null;
                    if ($min !== null && $min !== '' && is_numeric($min)) {
                        $where .= " AND ".$sqlCol." >= ".(float) $min;
                    }
                    if ($max !== null && $max !== '' && is_numeric($max)) {
                        $where .= " AND ".$sqlCol." <= ".(float) $max;
                    }
                    break;

                case 'boolean':
                    if (isset($filters[$apiCol]) && (string) $filters[$apiCol] !== '') {
                        $raw = (string) $filters[$apiCol];
                        if ($raw === '1' || $raw === '0') {
                            $where .= " AND ".$sqlCol." = ".(int) $raw;
                        } else {
                            dol_syslog(
                                "DPK PaginatedListTrait::buildSqlFilters ignoring non-boolean value '".$raw."' for filter '".$apiCol."'",
                                LOG_INFO
                            );
                        }
                    }
                    break;

                default:
                    dol_syslog(
                        "DPK PaginatedListTrait::buildSqlFilters unknown filter kind '".$kind."' for '".$apiCol."'",
                        LOG_WARNING
                    );
            }
        }

        return [$where, $sqlParams];
    }

    /**
     * Build a safe ORDER BY clause from the parsed sort/order params.
     *
     * The 'sort' API key is whitelisted via $sortableMap; if the requested
     * sort column is not in the whitelist (or empty), the $defaultSort is
     * applied verbatim.
     *
     * @param array<string,mixed>     $params       Output of parseListParams().
     * @param array<string,string>    $sortableMap  Whitelist [api_col => sql_col].
     * @param string                  $defaultSort  Fallback ORDER BY clause WITHOUT
     *                                              the leading "ORDER BY " keyword
     *                                              (e.g. "s.nom ASC, s.rowid ASC").
     * @return string                                 The full "ORDER BY ..." fragment.
     */
    protected function buildSortClause(array $params, array $sortableMap, $defaultSort)
    {
        $sort = isset($params['sort']) ? (string) $params['sort'] : '';
        $order = isset($params['order']) ? strtolower((string) $params['order']) : 'asc';
        if ($order !== 'asc' && $order !== 'desc') {
            $order = 'asc';
        }

        if ($sort !== '' && isset($sortableMap[$sort])) {
            $sqlCol = (string) $sortableMap[$sort];
            return " ORDER BY ".$sqlCol." ".strtoupper($order);
        }

        if ($sort !== '' && !isset($sortableMap[$sort])) {
            dol_syslog(
                "DPK PaginatedListTrait::buildSortClause ignoring non-whitelisted sort '".$sort."'",
                LOG_INFO
            );
        }

        return " ORDER BY ".((string) $defaultSort);
    }

    /**
     * Catalog-driven variant of buildSqlFilters().
     *
     * Replaces the hardcoded $filterMap / $searchFields arguments with the
     * mapper's introspection (cf docs/DATATABLE_SPEC.md section 13). The
     * mapper is expected to expose:
     *
     *   - getColumnCatalog() : array of {key, doliside, filterable, filterKind}
     *   - getSearchFields()  : array of doliside columns scanned by the
     *                          global search=...
     *
     * The $sqlAlias is prepended to each doliside column name so the WHERE
     * fragment fits the host query (e.g. "s." for societe joined as s).
     *
     * Filters whose key is not in the catalog are skipped (and logged at
     * LOG_INFO). Range suffixes _from/_to/_min/_max are tolerated.
     *
     * @param array<string,mixed> $params    Output of parseListParams().
     * @param object              $mapper    A mapper using dmCatalogTrait.
     * @param string              $sqlAlias  Table alias to prefix each column with (e.g. 's').
     * @return array{0:string,1:array<int,mixed>}
     */
    protected function buildSqlFiltersFromCatalog(array $params, $mapper, $sqlAlias = '')
    {
        if (!is_object($mapper) || !method_exists($mapper, 'getColumnCatalog')) {
            dol_syslog(
                "DPK PaginatedListTrait::buildSqlFiltersFromCatalog mapper does not expose getColumnCatalog()",
                LOG_ERR
            );
            return ['', []];
        }

        $catalog = $mapper->getColumnCatalog();
        $searchFieldsRaw = method_exists($mapper, 'getSearchFields') ? $mapper->getSearchFields() : [];

        $aliasPrefix = $this->normalizeSqlAlias($sqlAlias);

        // Build filterMap consumed by buildSqlFilters() from the catalog.
        $filterMap = [];
        foreach ($catalog as $entry) {
            if (!is_array($entry) || empty($entry['filterable']) || empty($entry['key']) || empty($entry['doliside'])) {
                continue;
            }
            $kind = isset($entry['filterKind']) ? (string) $entry['filterKind'] : 'text';
            $filterMap[(string) $entry['key']] = [
                'column' => $aliasPrefix.((string) $entry['doliside']),
                'kind'   => $kind,
            ];
        }

        // Apply alias to each search field too.
        $searchFields = [];
        foreach ($searchFieldsRaw as $col) {
            $searchFields[] = $aliasPrefix.((string) $col);
        }

        return $this->buildSqlFilters($params, $filterMap, $searchFields);
    }

    /**
     * Catalog-driven variant of buildSortClause().
     *
     * Same idea as buildSqlFiltersFromCatalog(): the sortable whitelist is
     * derived from the catalog (every entry with sortable=true is sortable
     * by its 'key' against its 'doliside').
     *
     * @param array<string,mixed>     $params      Output of parseListParams().
     * @param object                  $mapper      Mapper using dmCatalogTrait.
     * @param string                  $sqlAlias    SQL table alias (e.g. 's').
     * @param string                  $defaultSort Fallback ORDER BY clause WITHOUT
     *                                             the leading "ORDER BY " keyword
     *                                             (e.g. "s.nom ASC, s.rowid ASC").
     * @return string
     */
    protected function buildSortClauseFromCatalog(array $params, $mapper, $sqlAlias, $defaultSort)
    {
        if (!is_object($mapper) || !method_exists($mapper, 'getColumnCatalog')) {
            dol_syslog(
                "DPK PaginatedListTrait::buildSortClauseFromCatalog mapper does not expose getColumnCatalog()",
                LOG_ERR
            );
            return ' ORDER BY '.((string) $defaultSort);
        }

        $catalog = $mapper->getColumnCatalog();
        $aliasPrefix = $this->normalizeSqlAlias($sqlAlias);

        $sortableMap = [];
        foreach ($catalog as $entry) {
            if (!is_array($entry) || empty($entry['sortable']) || empty($entry['key']) || empty($entry['doliside'])) {
                continue;
            }
            $sortableMap[(string) $entry['key']] = $aliasPrefix.((string) $entry['doliside']);
        }

        return $this->buildSortClause($params, $sortableMap, $defaultSort);
    }

    /**
     * Normalize a SQL alias so callers can pass either "s" or "s.".
     *
     * @param   string  $sqlAlias
     * @return  string  empty string when no alias is given
     */
    private function normalizeSqlAlias($sqlAlias)
    {
        $a = trim((string) $sqlAlias);
        if ($a === '') {
            return '';
        }
        if (substr($a, -1) === '.') {
            return $a;
        }
        return $a.'.';
    }

    /**
     * Build the standard {items,total,page,limit} response envelope.
     *
     * @param array<int,mixed>  $items
     * @param int               $total
     * @param int               $page
     * @param int               $limit
     * @return array{items:array<int,mixed>,total:int,page:int,limit:int}
     */
    protected function formatPaginatedResponse(array $items, $total, $page, $limit)
    {
        return [
            'items' => $items,
            'total' => (int) $total,
            'page'  => (int) $page,
            'limit' => (int) $limit,
        ];
    }

    /**
     * Cheap ISO-8601 date check (YYYY-MM-DD only).
     *
     * @param string $value
     * @return bool
     */
    private static function isIsoDate($value)
    {
        return (bool) preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $value);
    }
}
