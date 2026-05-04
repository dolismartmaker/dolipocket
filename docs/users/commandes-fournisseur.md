---
title: "Commandes fournisseur"
weight: 120
description: "Passer commande à vos fournisseurs et suivre les réceptions."
---

# Commandes fournisseur

Une **commande fournisseur** matérialise un engagement d'achat envers un fournisseur. Elle suit un cycle propre en quatre étapes : brouillon, approuvée en interne, transmise au fournisseur, puis réceptionnée.

## Accéder aux commandes fournisseur

Depuis le menu principal, touchez **Commandes fournisseur**. La liste affiche toutes vos commandes d'achat avec leur référence (par exemple `CF2026-0001`), le fournisseur, la date, le montant et le statut.

## Créer une commande fournisseur

Touchez **Nouvelle commande fournisseur** et renseignez :

- Le **fournisseur** (recherche dans la liste des [tiers](tiers.md) marqués comme fournisseur)
- La **date** de commande
- Les **conditions de règlement** prévues (à 30 jours, à réception, etc.)
- Le **mode de règlement** prévu

Validez la création. La commande est créée en statut **Brouillon**. Ajoutez les lignes :

- **Produit ou service** -- choisi dans le catalogue (les articles marqués **À acheter** sont disponibles)
- **Référence fournisseur** -- la référence interne du fournisseur, qui peut différer de la vôtre
- **Quantité**
- **Prix d'achat unitaire HT**
- **Remise** éventuelle
- **Taux de TVA** (TVA déductible côté acheteur)

## Workflow approve / order / receive

Une commande fournisseur passe par trois états successifs après le brouillon :

### 1. Approuver

Touchez **Approuver**. Cette étape sert au contrôle interne : un responsable valide l'achat avant qu'il ne soit transmis au fournisseur. Sur les structures sans procédure d'approbation, c'est juste une formalité (vous approuvez votre propre commande).

Le statut passe à **Approuvée**.

### 2. Commander (transmettre)

Touchez **Commander**. Cela signifie que vous avez transmis la commande au fournisseur (par email, téléphone, courrier ou portail web fournisseur). Indiquez la date et la méthode de transmission.

Le statut passe à **Commandée**.

> **Astuce :** depuis ce statut, vous pouvez générer le PDF de la commande pour l'envoyer par email au fournisseur via le bouton **Envoyer par email**.

### 3. Réceptionner

Quand la marchandise arrive ou la prestation est achevée, ouvrez la commande et touchez **Réceptionner**. Pour chaque ligne, indiquez :

- La **quantité réellement reçue** (par défaut la quantité commandée, ajustez si besoin)
- La **date de réception**
- L'**entrepôt** où le stock entre

Si la livraison est complète, le statut passe à **Reçue**. Si elle est partielle, le statut reste **Commandée** ou passe à **Partiellement reçue** : vous pourrez compléter les réceptions au fil des livraisons suivantes.

La réception déclenche automatiquement les **entrées de stock** pour les produits physiques (voir [Stock](stock.md)).

## Statuts d'une commande fournisseur

| Statut | Signification |
|--------|---------------|
| Brouillon | En cours de saisie |
| Approuvée | Validée en interne, pas encore transmise au fournisseur |
| Commandée | Transmise au fournisseur, en attente de livraison |
| Partiellement reçue | Une partie des lignes a été réceptionnée |
| Reçue | Toutes les lignes ont été réceptionnées |
| Annulée | Commande abandonnée |

## Annuler une commande

Avant la réception, vous pouvez annuler la commande via le menu d'actions. Une raison peut être saisie. Si la commande a été partiellement réceptionnée, l'annulation ne porte que sur les lignes restantes.

## Lien avec la facture fournisseur

Une fois la commande reçue, vous attendrez en général une [facture fournisseur](factures-fournisseur.md). Vous pouvez la créer directement depuis la commande avec le bouton **Créer une facture fournisseur** : les lignes seront reprises automatiquement.

## Bonnes pratiques

- **Approuvez systématiquement** avant de commander : cette étape force une relecture qui évite les erreurs (mauvaise quantité, mauvais fournisseur)
- **Notez les références fournisseur** : elles facilitent les échanges en cas de litige (livraison incomplète, défaut)
- **Réceptionnez fidèlement** : ne saisissez que ce qui est réellement arrivé. Si la facture diffère ensuite de la livraison, vous saurez qui a raison.
- **Liez systématiquement la facture à la commande** : c'est essentiel pour le suivi des achats et la comptabilité
