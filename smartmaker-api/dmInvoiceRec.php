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
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

namespace Dolipocket\Api;

dol_include_once('/compta/facture/class/facture-rec.class.php');
dol_include_once('/dolipocket/smartmaker-api/Trait/dmCatalogTrait.php');

use SmartAuth\DolibarrMapping\dmBase;
use SmartAuth\DolibarrMapping\dmTrait;
use Dolipocket\Api\Trait\dmCatalogTrait;

/**
 * DolibarrMapping for FactureRec (recurring invoice template / modele de
 * facture recurrente). Tier A lot A5b.
 *
 * Maps the FactureRec header + its FactureLigneRec rows to API fields. The
 * "ref" of a template is its title (the facture_rec.titre column). The
 * controller MUST call $obj->fetch() then $obj->fetch_lines() before
 * exportMappedData().
 *
 * The LEFT keys are the PHP property names filled by FactureRec::fetch()
 * (socid = fk_soc column, title = titre column, cond_reglement_id =
 * fk_cond_reglement column, ...). The controller drives sort/filter via an
 * explicit SQL-column map rather than the catalog.
 */
class dmInvoiceRec extends dmBase
{
    use dmTrait;
    use dmCatalogTrait;

    /**
     * Dolibarr class name (used by dmTrait::boot()).
     * @var string
     */
    protected $dolibarrClassName = 'FactureRec';

    /**
     * Dolibarr line class.
     * @var string
     */
    protected $parentClassNameForLines = 'FactureLigneRec';

    /**
     * Element name for extrafields (must match llx_extrafields.elementtype).
     * @var string
     */
    protected $parentElementToUseForExtraFields = 'facturerec';

    /**
     * Table-side element name (consumed by SmartAuth dmTrait::_objectDesc()).
     * @var string
     */
    protected $parentTableElementToUseForExtraFields = 'facture_rec';

    /**
     * Mapping for the recurring invoice header.
     * @var array
     */
    protected $listOfPublishedFields = [
        'rowid'             => 'id',
        'ref'               => 'ref',
        'title'             => 'title',
        'socid'             => 'socid',
        'fk_soc'            => 'fk_soc',
        'fk_project'        => 'fk_project',
        'suspended'         => 'suspended',
        'frequency'         => 'frequency',
        'unit_frequency'    => 'unit_frequency',
        'date_when'         => 'date_when',
        'date_last_gen'     => 'date_last_gen',
        'nb_gen_done'       => 'nb_gen_done',
        'nb_gen_max'        => 'nb_gen_max',
        'auto_validate'     => 'auto_validate',
        'usenewprice'       => 'usenewprice',
        'date_creation'     => 'date_creation',
        'total_ht'          => 'total_ht',
        'total_ttc'         => 'total_ttc',
        'total_tva'         => 'total_tva',
        'cond_reglement_id' => 'fk_cond_reglement',
        'mode_reglement_id' => 'fk_mode_reglement',
        'note_public'       => 'note_public',
        'note_private'      => 'note_private',
    ];

    /**
     * Mapping for recurring invoice lines (FactureLigneRec).
     * @var array
     */
    protected $listOfPublishedFieldsForLines = [
        'rowid'          => 'id',
        'fk_product'     => 'fk_product',
        'product_ref'    => 'product_ref',
        'product_type'   => 'product_type',
        'label'          => 'label',
        'description'    => 'description',
        'qty'            => 'qty',
        'subprice'       => 'subprice',
        'tva_tx'         => 'tva_tx',
        'remise_percent' => 'remise_percent',
        'total_ht'       => 'total_ht',
        'total_tva'      => 'total_tva',
        'total_ttc'      => 'total_ttc',
        'rang'           => 'rang',
        'fk_unit'        => 'fk_unit',
    ];

    /**
     * Fields that can be modified via API (header).
     * @var array
     */
    protected $writableFields = [
        'title',
        'frequency',
        'unit_frequency',
        'date_when',
        'nb_gen_max',
        'auto_validate',
        'usenewprice',
        'note_public',
        'note_private',
    ];

    /**
     * Restrict the global search to the template's own string columns.
     *
     * @return array<int,string>
     */
    public function getSearchFields()
    {
        return ['titre'];
    }

    /**
     * Constructor.
     *
     * Loads optional read-only / read-write extrafields from configuration,
     * then boots the mapping.
     */
    public function __construct()
    {
        $extRO = getDolGlobalString('DOLIPOCKET_SMARTMAKER_INVOICEREC_EXTRAFIELDS_RO');
        if (!empty($extRO)) {
            foreach (explode(',', $extRO) as $field) {
                $field = trim($field);
                if (!empty($field)) {
                    $key = 'options_' . $field;
                    $this->listOfPublishedFields[$key] = $key;
                }
            }
        }

        $extRW = getDolGlobalString('DOLIPOCKET_SMARTMAKER_INVOICEREC_EXTRAFIELDS_RW');
        if (!empty($extRW)) {
            foreach (explode(',', $extRW) as $field) {
                $field = trim($field);
                if (!empty($field)) {
                    $key = 'options_' . $field;
                    $this->listOfPublishedFields[$key] = $key;
                    $this->writableFields[] = $key;
                }
            }
        }

        $this->boot();
    }
}
