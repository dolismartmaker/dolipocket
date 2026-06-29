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

namespace Dolipocket\Api\Trait;

/**
 * Generic helper shared by the document controllers (Proposal / Order /
 * Invoice / SupplierOrder / SupplierInvoice) to manage the "Contacts /
 * addresses" tab of a Dolibarr commonobject: list the linked contacts, add a
 * contact, remove one, and expose the available contact types for the element.
 *
 * It wraps CommonObject::liste_contact(), add_contact(), delete_contact() and
 * liste_type_contact(), so a tenant can attach a billing / shipping / follow-up
 * contact to any commercial document exactly as in Dolibarr standard.
 *
 * Wiring expected on the consumer controller:
 *  - listContacts($arr, $config) / addContact($arr, $config) /
 *    removeContact($arr, $config) are called from the controller methods.
 *
 * $config keys:
 *  - class         : Dolibarr class to instantiate ('\\Propal', '\\Commande',
 *                    '\\Facture', '\\CommandeFournisseur', '\\FactureFournisseur')
 *  - permGroup     : Dolibarr right group, flat module name ('propal') or a
 *                    2-level array (['fournisseur','commande'])
 *  - logTag        : 'ProposalController' ... (syslog prefix DPK <logTag>)
 *  - notFoundLabel : 'Proposal' ... (human label in error payloads)
 */
trait DocumentContactTrait
{
    /**
     * Resolve a Dolibarr right against a permGroup that is either a flat module
     * name or a 2-level array, with the usual admin bypass.
     *
     * @param string|array $permGroup
     * @param string       $action
     * @return bool
     */
    private function contactHasRight($permGroup, $action)
    {
        global $user;

        if (!empty($user->admin)) {
            return true;
        }
        if (is_array($permGroup)) {
            return (bool) $user->hasRight($permGroup[0], $permGroup[1], $action);
        }
        return (bool) $user->hasRight($permGroup, $action);
    }

    /**
     * Normalise liste_contact() rows (external + internal) into a flat appside
     * array. 'rowid' is the llx_element_contact link id used by removeContact.
     *
     * @param object $obj
     * @return array
     */
    private function buildContactList($obj)
    {
        $out = array();
        foreach (array('external', 'internal') as $source) {
            $rows = $obj->liste_contact(-1, $source);
            if (!is_array($rows)) {
                continue;
            }
            foreach ($rows as $r) {
                $out[] = array(
                    'rowid'     => isset($r['rowid']) ? (int) $r['rowid'] : 0,
                    'contactId' => isset($r['id']) ? (int) $r['id'] : 0,
                    'source'    => isset($r['source']) ? $r['source'] : $source,
                    'typeId'    => isset($r['fk_c_type_contact']) ? (int) $r['fk_c_type_contact'] : 0,
                    'typeCode'  => isset($r['code']) ? $r['code'] : '',
                    'typeLabel' => isset($r['libelle']) ? $r['libelle'] : '',
                    'civility'  => isset($r['civility']) ? $r['civility'] : '',
                    'firstname' => isset($r['firstname']) ? $r['firstname'] : '',
                    'lastname'  => isset($r['lastname']) ? $r['lastname'] : '',
                    'email'     => isset($r['email']) ? $r['email'] : '',
                    'status'    => isset($r['status']) ? (int) $r['status'] : 0,
                );
            }
        }
        return $out;
    }

    /**
     * Available contact types for the element (active only), both the external
     * (thirdparty contacts) and internal (users) sources.
     *
     * @param object $obj
     * @return array
     */
    private function buildContactTypes($obj)
    {
        $out = array();
        foreach (array('external', 'internal') as $source) {
            $types = $obj->liste_type_contact($source, 'position', 0, 1);
            if (!is_array($types)) {
                continue;
            }
            foreach ($types as $id => $label) {
                $out[] = array(
                    'id'     => (int) $id,
                    'source' => $source,
                    'label'  => $label,
                );
            }
        }
        return $out;
    }

    /**
     * Fetch the target object after a permission + id check. Returns the loaded
     * object on success, or an [errorPayload, httpCode] array on failure (the
     * caller forwards it as-is).
     *
     * @param array|null $arr
     * @param array      $config
     * @param string     $action  'lire' or 'creer'
     * @param string     $method  calling method name for the syslog prefix
     * @return object|array
     */
    private function contactFetchOrError($arr, array $config, $action, $method)
    {
        global $db;

        $logTag = isset($config['logTag']) ? (string) $config['logTag'] : 'Controller';
        $class = isset($config['class']) ? (string) $config['class'] : null;
        $permGroup = isset($config['permGroup']) ? $config['permGroup'] : null;
        $label = isset($config['notFoundLabel']) ? (string) $config['notFoundLabel'] : 'Document';

        if ($class === null || $permGroup === null) {
            dol_syslog("DPK {$logTag}::{$method} misconfigured (class/permGroup missing)", LOG_ERR);
            return array(array('error' => 'Server misconfigured'), 500);
        }

        if (!$this->contactHasRight($permGroup, $action)) {
            dol_syslog("DPK {$logTag}::{$method} forbidden user", LOG_WARNING);
            return array(array('error' => 'Forbidden'), 403);
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK {$logTag}::{$method} missing id", LOG_WARNING);
            return array(array('error' => $label . ' id is required'), 400);
        }

        $obj = new $class($db);
        if ($obj->fetch($id) <= 0) {
            dol_syslog("DPK {$logTag}::{$method} not found id=" . $id, LOG_WARNING);
            return array(array('error' => $label . ' not found'), 404);
        }

        return $obj;
    }

    /**
     * List the contacts linked to a document + the available contact types.
     *
     * @param array|null $arr
     * @param array      $config
     * @return array [ {contacts:[...], types:[...]}, httpCode ]
     */
    public function listContacts($arr, array $config)
    {
        $objOrError = $this->contactFetchOrError($arr, $config, 'lire', 'listContacts');
        if (is_array($objOrError)) {
            return $objOrError;
        }

        return array(
            array(
                'contacts' => $this->buildContactList($objOrError),
                'types'    => $this->buildContactTypes($objOrError),
            ),
            200,
        );
    }

    /**
     * Link a contact (external thirdparty contact or internal user) to a
     * document. Body: contact_id (int), type_id (int), source ('external'
     * default | 'internal').
     *
     * @param array|null $arr
     * @param array      $config
     * @return array
     */
    public function addContact($arr, array $config)
    {
        $logTag = isset($config['logTag']) ? (string) $config['logTag'] : 'Controller';

        $objOrError = $this->contactFetchOrError($arr, $config, 'creer', 'addContact');
        if (is_array($objOrError)) {
            return $objOrError;
        }

        $contactId = isset($arr['contact_id']) ? (int) $arr['contact_id'] : 0;
        $typeId = isset($arr['type_id']) ? (int) $arr['type_id'] : 0;
        $source = isset($arr['source']) && $arr['source'] === 'internal' ? 'internal' : 'external';

        if ($contactId <= 0 || $typeId <= 0) {
            dol_syslog("DPK {$logTag}::addContact missing contact_id/type_id", LOG_WARNING);
            return array(array('error' => 'contact_id and type_id are required'), 400);
        }

        $res = $objOrError->add_contact($contactId, $typeId, $source);
        if ($res <= 0) {
            dol_syslog("DPK {$logTag}::addContact add_contact() failed: " . $objOrError->error, LOG_ERR);
            return array(array('error' => 'Failed to add contact: ' . $objOrError->error), 500);
        }

        return array(
            array(
                'contacts' => $this->buildContactList($objOrError),
                'types'    => $this->buildContactTypes($objOrError),
            ),
            201,
        );
    }

    /**
     * Unlink a contact from a document. Route param 'rowid' is the
     * llx_element_contact link id (NOT the contact id).
     *
     * @param array|null $arr
     * @param array      $config
     * @return array
     */
    public function removeContact($arr, array $config)
    {
        $logTag = isset($config['logTag']) ? (string) $config['logTag'] : 'Controller';

        $objOrError = $this->contactFetchOrError($arr, $config, 'creer', 'removeContact');
        if (is_array($objOrError)) {
            return $objOrError;
        }

        $rowid = isset($arr['rowid']) ? (int) $arr['rowid'] : 0;
        if ($rowid <= 0) {
            dol_syslog("DPK {$logTag}::removeContact missing rowid", LOG_WARNING);
            return array(array('error' => 'Contact link id (rowid) is required'), 400);
        }

        $res = $objOrError->delete_contact($rowid);
        if ($res <= 0) {
            dol_syslog("DPK {$logTag}::removeContact delete_contact() failed: " . $objOrError->error, LOG_ERR);
            return array(array('error' => 'Failed to remove contact: ' . $objOrError->error), 500);
        }

        return array(
            array(
                'contacts' => $this->buildContactList($objOrError),
                'types'    => $this->buildContactTypes($objOrError),
            ),
            200,
        );
    }
}
