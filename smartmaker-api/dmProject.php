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

dol_include_once('/projet/class/project.class.php');
dol_include_once('/dolipocket/smartmaker-api/Trait/dmCatalogTrait.php');

use SmartAuth\DolibarrMapping\dmBase;
use SmartAuth\DolibarrMapping\dmTrait;
use Dolipocket\Api\Trait\dmCatalogTrait;

/**
 * DolibarrMapping for Project (projet) -- lot B1 of the project module campaign.
 *
 * A project is a header-only object (no document lines: its "lines" are Tasks,
 * a separate object handled by lot B3). The controller MUST call $obj->fetch()
 * before exportMappedData().
 *
 * IMPORTANT -- doliside keys are PHP property names filled by Project::fetch(),
 * NOT SQL column names. fetch() aliases several columns onto differently named
 * properties:
 *   - column dateo         -> property $date_start  (NOT $dateo, which stays unset)
 *   - column datee         -> property $date_end
 *   - column fk_statut     -> property $statut / $status
 *   - column fk_opp_status -> property $opp_status
 *   - column fk_soc        -> property $socid
 *   - column fk_user_close -> property $user_close_id
 *   - column datec         -> property $datec
 * exportMappedData() reads $obj->{doliside}, so publishing 'dateo' would export
 * null. The controller drives sort/filter through an EXPLICIT SQL-column map
 * (cf ProjectController) instead of the catalog, to bridge the same mismatch.
 */
class dmProject extends dmBase
{
    use dmTrait;
    use dmCatalogTrait;

    /**
     * Dolibarr class name (used by dmTrait::boot()).
     * @var string
     */
    protected $dolibarrClassName = 'Project';

    /**
     * Opt-in FK -> label companion fields resolved by dmTrait. Exposes the
     * customer name (+ email) alongside the raw socid. The 'fk_soc' key carries
     * the dual socid/fk_soc convention handled by dmTrait (reads $obj->socid).
     * @var array
     */
    protected $listOfForeignKeyLabels = [
        'fk_soc' => [
            'class'  => 'Societe',
            'path'   => 'societe/class/societe.class.php',
            'labels' => ['socname' => 'name', 'socEmail' => 'email'],
        ],
    ];

    /**
     * Element name for file storage / ECM ($object->element).
     * @var string
     */
    protected $parentElementToUseForExtraFields = 'project';

    /**
     * Table-side element name for extrafields (= llx_extrafields.elementtype).
     * Project stores its extrafields under the table_element 'projet' (NOT the
     * element name 'project'), because CommonObject::fetch_optionals() keys on
     * $this->table_element.
     * @var string
     */
    protected $parentTableElementToUseForExtraFields = 'projet';

    /**
     * Field-definition overrides consumed by dmTrait::propertiesFilter().
     *
     * Project::$fields['opp_amount']['visible'] is a raw PHP expression STRING
     * ('getDolGlobalString("PROJECT_USE_OPPORTUNITIES")') that Dolibarr eval's
     * at render time. SmartAuth's visibility filter does not eval it -- it calls
     * abs() on the value -- so the descriptor build (boot) throws a TypeError.
     * Override it with a plain visibility code (1 = create/update/read) so boot
     * succeeds. This only affects the descriptor; the DataTable column catalog
     * still reads the raw $fields value (0) so opp_amount is not shown by
     * default in lists.
     * @var array
     */
    protected $parentFieldsOverride = [
        'opp_amount' => ['visible' => 1],
    ];

    /**
     * Mapping for the project header (property doliside => appside snake_case).
     * @var array
     */
    protected $listOfPublishedFields = [
        'rowid'                => 'id',
        'ref'                  => 'ref',
        'title'                => 'title',
        'socid'                => 'socid',
        'description'          => 'description',
        'public'               => 'public',
        'date_start'           => 'date_start',
        'date_end'             => 'date_end',
        'date_close'           => 'date_close',
        'statut'               => 'statut',
        'opp_status'           => 'fk_opp_status',
        'opp_percent'          => 'opp_percent',
        'opp_amount'           => 'opp_amount',
        'budget_amount'        => 'budget_amount',
        'usage_opportunity'    => 'usage_opportunity',
        'usage_task'           => 'usage_task',
        'usage_bill_time'      => 'usage_bill_time',
        'usage_organize_event' => 'usage_organize_event',
        'note_public'          => 'note_public',
        'note_private'         => 'note_private',
        'model_pdf'            => 'model_pdf',
        'user_author_id'       => 'fk_user_author',
        'user_close_id'        => 'fk_user_close',
        'datec'                => 'date_creation',
    ];

    /**
     * Fields that can be modified via API (property names applied by the
     * controller before Project::update()).
     * @var array
     */
    protected $writableFields = [
        'ref',
        'title',
        'socid',
        'description',
        'public',
        'date_start',
        'date_end',
        'opp_status',
        'opp_percent',
        'opp_amount',
        'budget_amount',
        'usage_opportunity',
        'usage_task',
        'usage_bill_time',
        'note_public',
        'note_private',
    ];

    /**
     * Restrict the global search to the project's own string columns.
     *
     * @return array<int,string>
     */
    public function getSearchFields()
    {
        return ['ref', 'title'];
    }

    /**
     * Constructor.
     *
     * Loads optional read-only / read-write extrafields from configuration,
     * mirroring the other Dolipocket mappers, then boots the mapping.
     */
    public function __construct()
    {
        $extRO = getDolGlobalString('DOLIPOCKET_SMARTMAKER_PROJECT_EXTRAFIELDS_RO');
        if (!empty($extRO)) {
            foreach (explode(',', $extRO) as $field) {
                $field = trim($field);
                if (!empty($field)) {
                    $key = 'options_' . $field;
                    $this->listOfPublishedFields[$key] = $key;
                }
            }
        }

        $extRW = getDolGlobalString('DOLIPOCKET_SMARTMAKER_PROJECT_EXTRAFIELDS_RW');
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
