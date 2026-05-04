---
title: "Devis"
weight: 90
description: "Créer, envoyer et suivre vos devis client."
---

# Devis

Un **devis** (ou proposition commerciale) est un engagement chiffré envoyé à un prospect ou client. Tant qu'il n'est pas signé, il n'a pas de valeur contractuelle ; une fois accepté, il peut être converti en commande client puis en facture.

## Accéder aux devis

Depuis le menu principal, touchez **Devis**. La liste affiche tous vos devis, triés par date de création (les plus récents en haut). Chaque ligne montre :

- La **référence** (générée automatiquement, par exemple `PR2026-0001`)
- Le **client**
- la **date** d'émission et la **date de fin de validité**
- Le **montant HT**
- Le **statut** : Brouillon, Validé (ouvert), Signé, Refusé, Facturé

Un filtre rapide vous permet de basculer entre **À traiter** (brouillons et ouverts), **Signés**, **Refusés**, **Tous**.

## Créer un devis

1. Touchez **Nouveau devis**
2. Choisissez le **client** (recherche par nom dans la liste des [tiers](tiers.md))
3. Choisissez la **date de devis** (par défaut aujourd'hui) et la **date de fin de validité** (par défaut J+30)
4. Validez la création : le devis est créé en statut **Brouillon**, sans aucune ligne

## Ajouter des lignes

Sur la fiche d'un devis brouillon, touchez **Ajouter une ligne** pour saisir un article :

- **Produit ou service** -- choisissez dans le catalogue (le libellé, le prix et le taux de TVA sont alors pré-remplis)
- **Description libre** -- modifiable même si vous partez d'un article du catalogue
- **Quantité**
- **Prix unitaire HT** -- modifiable pour gérer les remises ponctuelles
- **Remise (%)** -- en plus du prix unitaire
- **Taux de TVA**

Validez la ligne. Vous pouvez en ajouter autant que nécessaire. Pour réorganiser l'ordre, faites glisser les lignes verticalement (poignée à gauche).

Vous pouvez aussi insérer des **lignes de titre** (sans prix) et des **sous-totaux** pour structurer un devis long.

## Valider et envoyer le devis

Une fois le contenu finalisé, touchez **Valider**. Le devis passe du statut **Brouillon** à **Validé (ouvert)**, sa référence devient définitive et il n'est plus modifiable directement (vous devrez le repasser en brouillon pour ajuster).

Pour l'envoyer au client :

1. Touchez **Envoyer par email** sur la fiche du devis
2. Vérifiez le destinataire (pré-rempli avec l'email du contact commercial du tiers)
3. Modifiez le sujet et le corps si besoin
4. Le PDF du devis est joint automatiquement
5. Touchez **Envoyer**

Vous pouvez aussi télécharger le PDF pour l'envoyer manuellement par un autre canal.

## Suivi du devis

Une fois envoyé, le devis reste au statut **Validé (ouvert)** jusqu'à la décision du client. Selon sa réponse, vous le marquez :

- **Signé** -- le client a accepté. Le statut bascule et un bouton **Convertir en commande** apparaît
- **Refusé** -- le client a décliné. Le devis reste consultable mais sort des listes actives

## Convertir en commande

Quand un devis est signé, touchez **Convertir en commande** pour générer automatiquement une [commande client](commandes.md) reprenant :

- Le même client
- Toutes les lignes du devis (libellés, quantités, prix)
- Une référence pointant vers le devis d'origine

La commande est créée en statut Brouillon ; vous pouvez ensuite l'ajuster avant de la valider et la facturer.

## Modifier un devis validé

Pour corriger un devis déjà validé (par exemple suite à une renégociation avec le client) :

1. Ouvrez la fiche du devis
2. Touchez le menu d'actions et choisissez **Repasser en brouillon**
3. Effectuez vos modifications
4. Revalidez et renvoyez au client

> **Bonne pratique :** plutôt que de modifier un devis envoyé, créez un nouveau devis qui reprend le précédent (option **Cloner ce devis** dans le menu d'actions). Vous gardez ainsi une traçabilité claire des versions négociées.

## Statuts détaillés

| Statut | Signification |
|--------|---------------|
| Brouillon | En cours de saisie, non envoyable |
| Validé (ouvert) | Envoyé au client, en attente de décision |
| Signé | Accepté par le client |
| Refusé | Décliné par le client |
| Facturé | Au moins une facture a été émise depuis ce devis |

## Bonnes pratiques

- **Datez la fin de validité** : un devis sans limite incite le client à différer sa décision
- **Soignez les conditions** : précisez les délais d'exécution, les modalités de paiement, les conditions de livraison dans la note ou les conditions générales
- **Suivez vos relances** : un devis signé tardivement est un client perdu
- **Archivez les versions** : utilisez le clonage plutôt que la modification pour conserver l'historique des négociations
