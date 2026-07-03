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

dol_include_once('/projet/class/task.class.php');
dol_include_once('/dolipocket/smartmaker-api/Trait/dmCatalogTrait.php');

use SmartAuth\DolibarrMapping\dmBase;
use SmartAuth\DolibarrMapping\dmTrait;
use Dolipocket\Api\Trait\dmCatalogTrait;

/**
 * DolibarrMapping for Task (projet_task) -- lot B3.
 *
 * A task belongs to a project (fk_projet, aliased to $this->fk_project by
 * Task::fetch()) and forms a tree via fk_task_parent + rang. The controller
 * MUST call $obj->fetch() before exportMappedData().
 *
 * doliside keys = PHP property names filled by Task::fetch():
 *   - column fk_projet -> property $fk_project  (aliased in the SELECT)
 *   - column dateo     -> property $date_start
 *   - column datee     -> property $date_end
 *   - column datec     -> property $date_c
 * exportMappedData() reads $obj->{doliside}. Sort/filter are driven by explicit
 * SQL-column maps in TaskController (property vs column mismatch, same as
 * dmProject).
 */
class dmTask extends dmBase
{
    use dmTrait;
    use dmCatalogTrait;

    /**
     * Dolibarr class name (used by dmTrait::boot()).
     * @var string
     */
    protected $dolibarrClassName = 'Task';

    /**
     * Element name for file storage / ECM ($object->element).
     * @var string
     */
    protected $parentElementToUseForExtraFields = 'project_task';

    /**
     * Table-side element name for extrafields (= llx_extrafields.elementtype).
     * Task keys its extrafields on the table_element 'projet_task'.
     * @var string
     */
    protected $parentTableElementToUseForExtraFields = 'projet_task';

    /**
     * Mapping for the task (property doliside => appside snake_case).
     * @var array
     */
    protected $listOfPublishedFields = [
        'rowid'              => 'id',
        'ref'                => 'ref',
        'label'              => 'label',
        'description'        => 'description',
        'fk_project'         => 'fk_project',
        'fk_task_parent'     => 'fk_task_parent',
        'date_start'         => 'date_start',
        'date_end'           => 'date_end',
        'date_c'             => 'date_creation',
        'planned_workload'   => 'planned_workload',
        'duration_effective' => 'duration_effective',
        'progress'           => 'progress',
        'priority'           => 'priority',
        'fk_statut'          => 'fk_statut',
        'budget_amount'      => 'budget_amount',
        'note_public'        => 'note_public',
        'note_private'       => 'note_private',
        'rang'               => 'rang',
        'fk_user_creat'      => 'fk_user_author',
    ];

    /**
     * Fields that can be modified via API (property names applied by the
     * controller before Task::update()).
     * @var array
     */
    protected $writableFields = [
        'label',
        'description',
        'fk_task_parent',
        'date_start',
        'date_end',
        'planned_workload',
        'progress',
        'priority',
        'budget_amount',
        'note_public',
        'note_private',
    ];

    /**
     * Restrict the global search to the task's own string columns (Task::$fields
     * is empty, so the catalog would otherwise report nothing searchable).
     *
     * @return array<int,string>
     */
    public function getSearchFields()
    {
        return ['ref', 'label'];
    }

    /**
     * Constructor.
     */
    public function __construct()
    {
        $extRO = getDolGlobalString('DOLIPOCKET_SMARTMAKER_TASK_EXTRAFIELDS_RO');
        if (!empty($extRO)) {
            foreach (explode(',', $extRO) as $field) {
                $field = trim($field);
                if (!empty($field)) {
                    $key = 'options_' . $field;
                    $this->listOfPublishedFields[$key] = $key;
                }
            }
        }

        $extRW = getDolGlobalString('DOLIPOCKET_SMARTMAKER_TASK_EXTRAFIELDS_RW');
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
