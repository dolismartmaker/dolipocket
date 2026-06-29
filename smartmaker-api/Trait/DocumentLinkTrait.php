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
 * Invoice / SupplierOrder / SupplierInvoice) to expose the "Linked objects"
 * box of a Dolibarr commonobject: list the related documents (e.g. the order an
 * invoice was created from) and unlink one.
 *
 * It wraps CommonObject::fetchObjectLinked() and deleteObjectLinked(), so a
 * tenant sees the same document chain as in Dolibarr standard. Manual linking
 * is intentionally not exposed: the createFrom* workflow already builds the
 * links automatically, which covers the common SaaS use case.
 *
 * $config keys: identical to DocumentContactTrait (class / permGroup / logTag /
 * notFoundLabel).
 */
trait DocumentLinkTrait
{
    /**
     * Resolve a Dolibarr right against a permGroup that is either a flat module
     * name or a 2-level array, with the usual admin bypass.
     *
     * @param string|array $permGroup
     * @param string       $action
     * @return bool
     */
    private function linkHasRight($permGroup, $action)
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
     * Human label for a Dolibarr element type (linked object key).
     *
     * @param string $type
     * @return string
     */
    private function linkTypeLabel($type)
    {
        $map = array(
            'propal'              => 'Devis',
            'commande'            => 'Commande',
            'facture'             => 'Facture',
            'order_supplier'      => 'Commande fournisseur',
            'commande_fournisseur' => 'Commande fournisseur',
            'invoice_supplier'    => 'Facture fournisseur',
            'facture_fourn'       => 'Facture fournisseur',
            'shipping'            => 'Expedition',
            'contrat'             => 'Contrat',
            'fichinter'           => 'Intervention',
            'project'             => 'Projet',
        );
        return isset($map[$type]) ? $map[$type] : $type;
    }

    /**
     * Build the flat list of objects linked to $obj. Each entry carries the
     * 'rowid' of the llx_element_element link (used by removeLink).
     *
     * @param object $obj
     * @return array
     */
    private function buildLinkList($obj)
    {
        $out = array();
        $obj->fetchObjectLinked();

        $linked = is_array($obj->linkedObjects) ? $obj->linkedObjects : array();
        $idsByType = is_array($obj->linkedObjectsIds) ? $obj->linkedObjectsIds : array();

        foreach ($linked as $type => $objects) {
            if (!is_array($objects)) {
                continue;
            }
            $idsMap = isset($idsByType[$type]) && is_array($idsByType[$type]) ? $idsByType[$type] : array();
            foreach ($objects as $linkedObj) {
                $linkedId = isset($linkedObj->id) ? (int) $linkedObj->id : 0;
                $rowid = 0;
                foreach ($idsMap as $rid => $fk) {
                    if ((int) $fk === $linkedId) {
                        $rowid = (int) $rid;
                        break;
                    }
                }
                $statut = null;
                if (isset($linkedObj->statut)) {
                    $statut = (int) $linkedObj->statut;
                } elseif (isset($linkedObj->status)) {
                    $statut = (int) $linkedObj->status;
                }
                $out[] = array(
                    'rowid'  => $rowid,
                    'type'   => $type,
                    'label'  => $this->linkTypeLabel($type),
                    'id'     => $linkedId,
                    'ref'    => isset($linkedObj->ref) ? $linkedObj->ref : '',
                    'statut' => $statut,
                );
            }
        }
        return $out;
    }

    /**
     * Fetch the target object after a permission + id check. Returns the loaded
     * object on success or an [errorPayload, httpCode] array on failure.
     *
     * @param array|null $arr
     * @param array      $config
     * @param string     $action
     * @param string     $method
     * @return object|array
     */
    private function linkFetchOrError($arr, array $config, $action, $method)
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

        if (!$this->linkHasRight($permGroup, $action)) {
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
     * List the objects linked to a document.
     *
     * @param array|null $arr
     * @param array      $config
     * @return array [ {links:[...]}, httpCode ]
     */
    public function listLinks($arr, array $config)
    {
        $objOrError = $this->linkFetchOrError($arr, $config, 'lire', 'listLinks');
        if (is_array($objOrError)) {
            return $objOrError;
        }

        return array(array('links' => $this->buildLinkList($objOrError)), 200);
    }

    /**
     * Unlink a related object. Route param 'rowid' is the llx_element_element
     * link id.
     *
     * @param array|null $arr
     * @param array      $config
     * @return array
     */
    public function removeLink($arr, array $config)
    {
        $logTag = isset($config['logTag']) ? (string) $config['logTag'] : 'Controller';

        $objOrError = $this->linkFetchOrError($arr, $config, 'creer', 'removeLink');
        if (is_array($objOrError)) {
            return $objOrError;
        }

        $rowid = isset($arr['rowid']) ? (int) $arr['rowid'] : 0;
        if ($rowid <= 0) {
            dol_syslog("DPK {$logTag}::removeLink missing rowid", LOG_WARNING);
            return array(array('error' => 'Link id (rowid) is required'), 400);
        }

        $res = $objOrError->deleteObjectLinked(null, '', null, '', $rowid);
        if ($res <= 0) {
            dol_syslog("DPK {$logTag}::removeLink deleteObjectLinked() failed: " . $objOrError->error, LOG_ERR);
            return array(array('error' => 'Failed to unlink object: ' . $objOrError->error), 500);
        }

        return array(array('links' => $this->buildLinkList($objOrError)), 200);
    }
}
