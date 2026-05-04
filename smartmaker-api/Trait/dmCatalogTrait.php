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
 * Locally derived companion to SmartAuth's dmTrait that exposes the column
 * catalog needed by the v2 DataTable (cf docs/DATATABLE_SPEC.md section 13).
 *
 * Why a local trait instead of editing smartauth/dolMapping/dmTrait.php directly:
 *   - The Dolipocket sandbox blocks edits under ~/dev/smartauth/. The DataTable
 *     spec section 13 explicitly anticipates this fallback ("Si ce n'est pas
 *     autorise d'editer smartauth depuis Dolipocket, alors tu crees un trait
 *     derive Dolipocket\Api\Trait\dmCatalogTrait que tu importes via use dans
 *     chaque mapper de Dolipocket").
 *   - Once the rule is lifted (or the change is merged upstream), the only
 *     thing to change is to drop "use dmCatalogTrait" from each mapper; no
 *     consumer code needs to change because the methods will still exist on
 *     dmBase / dmTrait.
 *
 * Methods exposed:
 *   - getColumnCatalog()   : normalized list of {key,label,type,sortable,...}
 *   - getSearchFields()    : whitelist of doliside columns for global LIKE search
 *   - exportMappedDataFiltered($obj, $includeKeys) : exportMappedData() that
 *                            also accepts an optional whitelist of appside keys
 *
 * The trait expects the host class to also use SmartAuth\DolibarrMapping\dmTrait
 * (so that exportMappedData(), objectDesc(), $listOfPublishedFields,
 * $parentClassName, etc. are available).
 */
trait dmCatalogTrait
{
    /**
     * Default UI hint widths in pixels per normalized type.
     *
     * @var array<string,int>
     */
    private static $CATALOG_DEFAULT_WIDTHS = [
        'string'   => 180,
        'int'      => 80,
        'float'    => 100,
        'date'     => 120,
        'datetime' => 140,
        'boolean'  => 80,
        'select'   => 140,
        'text'     => 240,
    ];

    /**
     * Build a normalized column catalog for the DataTable consumer.
     *
     * Uses dmTrait::objectDesc() (already cached at boot time) to read the
     * filtered + translated descriptors for each appside field, and pairs
     * them with the raw $fields[$doliside] entry of the parent Dolibarr
     * class to enrich with: raw type string, visible code, searchable flag,
     * arrayofkeyval (for select options).
     *
     * Excludes:
     *   - id and entity (always served by the API, not user-facing columns)
     *   - fields with $fields[$doliside]['visible'] === 0
     *   - the synthetic "lines" repeater
     *
     * @return array<int,array<string,mixed>>
     */
    public function getColumnCatalog()
    {
        global $db, $conf, $langs;

        $desc = $this->objectDesc();      // cached stdClass from dmTrait::boot()
        $publishedFields = $this->listOfPublishedFields ?? [];

        // Instantiate the parent Dolibarr class so we can read its raw $fields.
        // This mirrors what dmTrait::_objectDesc() does internally (line 115).
        // We tolerate failure -- the catalog still works with the descriptor
        // alone, just with less rich type/searchable info.
        $rawFields = [];
        $parentClassName = $this->parentClassName ?? null;
        if (!empty($parentClassName) && class_exists($parentClassName)) {
            try {
                $parentObj = new $parentClassName($db);
                if (property_exists($parentObj, 'fields') && is_array($parentObj->fields)) {
                    $rawFields = $parentObj->fields;
                }
            } catch (\Throwable $e) {
                dol_syslog(
                    "DPK dmCatalogTrait::getColumnCatalog could not instantiate ".$parentClassName.": ".$e->getMessage(),
                    LOG_WARNING
                );
            }
        }

        // Pre-load extrafields metadata once so we can flag appside keys that
        // come from extrafields with group=extrafield.
        $extrafieldKeys = [];
        $parentElement = $this->parentTableElementToUseForExtraFields ?? '';
        if (!empty($parentElement)) {
            try {
                $ef = new \ExtraFields($db);
                $ef->fetch_name_optionals_label($parentElement);
                if (!empty($ef->attributes[$parentElement]['type']) && is_array($ef->attributes[$parentElement]['type'])) {
                    foreach ($ef->attributes[$parentElement]['type'] as $extraName => $_type) {
                        $extrafieldKeys['options_'.$extraName] = true;
                    }
                }
            } catch (\Throwable $e) {
                dol_syslog(
                    "DPK dmCatalogTrait::getColumnCatalog could not load extrafields for ".$parentElement.": ".$e->getMessage(),
                    LOG_WARNING
                );
            }
        }

        $catalog = [];
        foreach ($publishedFields as $doliside => $appside) {
            $appside = (string) $appside;

            // Skip system / invisible fields.
            if ($appside === 'id' || $doliside === 'rowid' || $appside === 'entity' || $doliside === 'entity') {
                continue;
            }

            // Honor explicit Dolibarr visible=0 (kept "internal", e.g. note_public html).
            if (isset($rawFields[$doliside]) && isset($rawFields[$doliside]['visible']) && (int) $rawFields[$doliside]['visible'] === 0) {
                continue;
            }

            // Pull translated descriptor (label, type, position, max...).
            $fieldDesc = isset($desc->{$appside}) ? $desc->{$appside} : null;
            if (!is_array($fieldDesc)) {
                // Could still be an FK-resolved stdClass (rare). Fallback to raw.
                $fieldDesc = [];
            }

            // Group classification.
            $group = 'main';
            if (isset($extrafieldKeys[$doliside]) || strpos($doliside, 'options_') === 0) {
                $group = 'extrafield';
            }

            // Resolve raw type (used for the heuristics below).
            $rawType = '';
            if (isset($rawFields[$doliside]['type'])) {
                $rawType = (string) $rawFields[$doliside]['type'];
            }
            // For extrafields, fall back to the descriptor's normalized type.
            if ($rawType === '' && isset($fieldDesc['type'])) {
                $rawType = (string) $fieldDesc['type'];
            }

            // Normalize type + filter kind.
            list($apiType, $filterKind, $sortable) = $this->normalizeCatalogType($rawType);

            // Visible default.
            $rawVisible = null;
            if (isset($rawFields[$doliside]['visible'])) {
                $rawVisible = (int) $rawFields[$doliside]['visible'];
            }
            $defaultVisible = ($rawVisible === 1);

            // Label (already translated in fieldDesc by propertiesFilter).
            $label = '';
            if (isset($fieldDesc['label']) && is_string($fieldDesc['label']) && $fieldDesc['label'] !== '') {
                $label = $fieldDesc['label'];
            } elseif (isset($rawFields[$doliside]['label'])) {
                $label = $langs->transnoentities((string) $rawFields[$doliside]['label']);
            } else {
                $label = ucfirst(str_replace('_', ' ', $appside));
            }

            // Filter options (select with static map, e.g. tinyint flags).
            $filterOptions = null;
            if ($filterKind === 'select') {
                if (isset($rawFields[$doliside]['arrayofkeyval']) && is_array($rawFields[$doliside]['arrayofkeyval'])) {
                    $filterOptions = [];
                    foreach ($rawFields[$doliside]['arrayofkeyval'] as $val => $optLabel) {
                        $filterOptions[] = [
                            'value' => $val,
                            'label' => $langs->transnoentities((string) $optLabel),
                        ];
                    }
                }
                // sellist: / link: keep filterOptions=null (dynamic, resolved client-side).
            }

            $defaultWidth = self::$CATALOG_DEFAULT_WIDTHS[$apiType] ?? 140;

            $catalog[] = [
                'key'            => $appside,
                'label'          => $label,
                'type'           => $apiType,
                'sortable'       => $sortable,
                'filterable'     => true,
                'filterKind'     => $filterKind,
                'filterOptions'  => $filterOptions,
                'defaultVisible' => $defaultVisible,
                'defaultWidth'   => $defaultWidth,
                'group'          => $group,
                'doliside'       => (string) $doliside,
            ];
        }

        return $catalog;
    }

    /**
     * Whitelist of doliside columns scanned by the global LIKE search.
     *
     * Default = every string-typed published field whose Dolibarr $fields
     * entry has searchable=1. For Dolibarr classes without searchable hints
     * (the majority on Dolibarr 18), the fallback behaviour is to expose
     * every string column. Subclasses can override this method to narrow
     * the scope (e.g. limit to "name + email + code_client" for performance).
     *
     * @return array<int,string>
     */
    public function getSearchFields()
    {
        global $db;

        $publishedFields = $this->listOfPublishedFields ?? [];

        $rawFields = [];
        $parentClassName = $this->parentClassName ?? null;
        if (!empty($parentClassName) && class_exists($parentClassName)) {
            try {
                $parentObj = new $parentClassName($db);
                if (property_exists($parentObj, 'fields') && is_array($parentObj->fields)) {
                    $rawFields = $parentObj->fields;
                }
            } catch (\Throwable $e) {
                dol_syslog(
                    "DPK dmCatalogTrait::getSearchFields could not instantiate ".$parentClassName.": ".$e->getMessage(),
                    LOG_WARNING
                );
            }
        }

        // Detect whether ANY field declares searchable -- if yes, honor it
        // strictly; if no, fall back to "all string fields are searchable".
        $hasSearchableHints = false;
        foreach ($rawFields as $f) {
            if (is_array($f) && array_key_exists('searchable', $f)) {
                $hasSearchableHints = true;
                break;
            }
        }

        $out = [];
        foreach ($publishedFields as $doliside => $appside) {
            if (strpos((string) $doliside, 'options_') === 0) {
                continue; // extrafields not searched globally
            }
            if ($doliside === 'rowid' || $doliside === 'entity') {
                continue;
            }
            $rawType = isset($rawFields[$doliside]['type']) ? (string) $rawFields[$doliside]['type'] : '';
            if (!$this->isSearchableType($rawType)) {
                continue;
            }
            if ($hasSearchableHints) {
                $searchable = isset($rawFields[$doliside]['searchable']) ? (int) $rawFields[$doliside]['searchable'] : 0;
                if ($searchable !== 1) {
                    continue;
                }
            }
            $out[] = (string) $doliside;
        }

        return $out;
    }

    /**
     * Wrapper around exportMappedData() that filters the resulting stdClass to
     * only the appside keys requested by the caller.
     *
     * Backward compat: when $includeKeys is null, this is a strict pass-through.
     * The caller is expected to pass an array (possibly empty) when filtering
     * is desired.
     *
     * Structural keys (categories, lines, nb_linked_files, linked_files) are
     * preserved when present so callers requesting just business columns do
     * not lose the related metadata. Tests can opt out by listing them
     * explicitly in $includeKeys.
     *
     * @param   object       $obj          Dolibarr object instance (Societe, Contact, ...)
     * @param   array|null   $includeKeys  Optional whitelist of appside keys.
     *
     * @return  \stdClass
     */
    public function exportMappedDataFiltered($obj, $includeKeys = null)
    {
        // Delegate the heavy lifting to dmTrait::exportMappedData().
        $full = $this->exportMappedData($obj);

        if ($includeKeys === null) {
            return $full;
        }
        if (!is_array($includeKeys) || empty($includeKeys)) {
            // Empty array = no business keys requested; only structural ones survive.
            $includeKeys = [];
        }

        // Always preserve structural keys that the caller did not strip explicitly.
        $structuralKeys = ['lines', 'categories', 'nb_linked_files', 'linked_files'];
        $allowedSet = array_fill_keys($includeKeys, true);
        // 'id' is always carried (otherwise the row is unusable client-side).
        $allowedSet['id'] = true;

        $out = new \stdClass();
        foreach ($full as $k => $v) {
            if (isset($allowedSet[$k]) || in_array($k, $structuralKeys, true)) {
                $out->{$k} = $v;
            }
        }
        return $out;
    }

    /**
     * Map a raw Dolibarr type string to (apiType, filterKind, sortable).
     *
     * @param   string  $rawType
     * @return  array{0:string,1:string,2:bool}
     */
    private function normalizeCatalogType($rawType)
    {
        $t = strtolower(trim((string) $rawType));

        // Strip parametric suffixes ("varchar(128)" -> "varchar", "double(24,8)" -> "double").
        if (($paren = strpos($t, '(')) !== false) {
            $t = substr($t, 0, $paren);
        }
        // Strip Dolibarr FK descriptors ("integer:User:user/class/user.class.php" -> "integer").
        if (($colon = strpos($t, ':')) !== false) {
            $head = substr($t, 0, $colon);
            // Keep "sellist" / "link" / "chkbxlst" markers because they steer filterKind.
            if (in_array($head, ['integer', 'int', 'varchar', 'text'], true)) {
                $t = $head;
            } else {
                $t = $head;
            }
        }

        switch ($t) {
            case 'varchar':
            case 'string':
                return ['string', 'text', true];
            case 'text':
            case 'html':
                return ['text', 'text', false];
            case 'int':
            case 'integer':
                return ['int', 'numberrange', true];
            case 'double':
            case 'float':
            case 'real':
            case 'price':
                return ['float', 'numberrange', true];
            case 'date':
                return ['date', 'daterange', true];
            case 'datetime':
            case 'timestamp':
                return ['datetime', 'daterange', true];
            case 'boolean':
            case 'bool':
            case 'tinyint':
            case 'checkbox':
                return ['boolean', 'boolean', true];
            case 'select':
            case 'sellist':
            case 'chkbxlst':
            case 'radio':
            case 'link':
                return ['select', 'select', true];
            case 'mail':
            case 'email':
                return ['string', 'text', true];
            case 'phone':
            case 'phonenumber':
                return ['string', 'text', true];
            case 'url':
                return ['string', 'text', true];
        }

        // Unknown / module-specific custom types (smartphoto_, smartfile_, ...).
        return ['string', 'text', false];
    }

    /**
     * Heuristic for "is this raw Dolibarr type a string the user might want to
     * search through?". Used by getSearchFields().
     *
     * @param   string  $rawType
     * @return  bool
     */
    private function isSearchableType($rawType)
    {
        $t = strtolower(trim((string) $rawType));
        if ($t === '') {
            // Empty type = unknown, assume string (most common case for legacy fields).
            return true;
        }
        if (($paren = strpos($t, '(')) !== false) {
            $t = substr($t, 0, $paren);
        }
        if (($colon = strpos($t, ':')) !== false) {
            $t = substr($t, 0, $colon);
        }
        return in_array($t, ['varchar', 'string', 'mail', 'email', 'phone', 'url'], true);
    }
}
