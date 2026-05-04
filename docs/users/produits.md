---
title: "Produits et services"
weight: 60
description: "Gérer le catalogue produits et services de votre activité."
---

# Catalogue produits et services

Le catalogue centralise tout ce que vous vendez et tout ce que vous achetez : marchandises physiques, prestations de service, abonnements, frais de port, etc. Une fiche bien renseignée vous fait gagner du temps lors de la création de devis, commandes et factures puisque les libellés, prix et taux de TVA sont alors pré-remplis automatiquement.

## Accéder au catalogue

Depuis le menu principal, touchez **Produits**. La liste affiche tous les éléments du catalogue, distinguant **produits** (biens physiques) et **services** par leur icône. Un filtre rapide permet de basculer entre les deux types ou d'afficher tout.

La barre de recherche filtre par référence, libellé ou code-barres.

## Créer un produit ou un service

Touchez **Nouveau produit** ou **Nouveau service** depuis la liste, puis renseignez :

- **Référence** -- code unique pour identifier l'article (par exemple `PROD-001`, `SERV-MAINT`). Si vous laissez le champ vide, Dolipocket génère automatiquement une référence.
- **Libellé** -- nom commercial qui apparaîtra sur les documents
- **Description** -- texte plus long affiché en dessous du libellé sur les devis et factures
- **Prix de vente HT** ou **TTC** -- choisissez le mode de saisie selon votre habitude
- **Taux de TVA** -- 20 %, 10 %, 5,5 %, 2,1 %, ou 0 % en France ; modifiable selon votre pays
- **Prix d'achat** -- pour calculer la marge (optionnel)
- **Statut "à vendre"** -- cochez si l'article doit apparaître dans la sélection lors de la saisie d'un devis ou d'une facture client
- **Statut "à acheter"** -- cochez si l'article doit apparaître lors de la saisie d'une commande ou facture fournisseur
- **Unité** -- pièce, heure, jour, kilogramme, mètre, etc.

Pour les **produits physiques**, vous pouvez en plus renseigner :

- **Code-barres** (EAN13, etc.)
- **Poids** et **dimensions**
- **Pays d'origine** et **code douanier** pour l'export

Validez avec **Enregistrer**.

## Prix HT ou TTC : comment choisir ?

Si vous facturez majoritairement à des **professionnels assujettis à la TVA**, raisonnez en HT : c'est le prix qui apparaît sur les bons de commande et que vos clients négocient.

Si vous facturez surtout à des **particuliers**, raisonnez en TTC : c'est le prix réel que paie le client. Dolipocket recalculera automatiquement le HT à partir du taux de TVA.

Vous pouvez basculer le mode de saisie à tout moment ; le prix dans l'autre devise est recalculé automatiquement.

## Modifier un article

Depuis la fiche, touchez **Modifier**. Tous les champs deviennent éditables. La modification d'un prix n'affecte **pas** rétroactivement les devis et factures déjà émis : seuls les nouveaux documents prendront en compte le nouveau prix.

## Statuts des articles

Chaque article peut être :

- **Actif** (à vendre et/ou à acheter) -- proposé dans les listes de saisie
- **Inactif** -- masqué des listes mais conservé pour l'historique

Pour retirer un article du catalogue sans casser l'historique, décochez **À vendre** et **À acheter** : il restera consultable dans les anciennes factures mais ne sera plus proposé pour de nouvelles saisies.

## Suppression

La suppression définitive n'est possible que pour un article qui n'a jamais été utilisé sur un document. Sinon, désactivez-le.

## Bonnes pratiques

- **Standardisez vos références** : une nomenclature claire (par exemple préfixe par catégorie) facilite la recherche
- **Soignez le libellé** : il apparaîtra tel quel sur les documents envoyés au client
- **Renseignez le prix d'achat** pour les produits revendus : Dolipocket vous indiquera la marge en temps réel à la création d'une facture
- **Utilisez la description longue** pour préciser les caractéristiques techniques ou les conditions de vente associées à l'article
