---
title: "Gestion du stock"
weight: 80
description: "Suivre les quantités, enregistrer des mouvements et ajuster l'inventaire."
---

# Gestion du stock

Le module de stock vous permet de connaître à tout moment les quantités disponibles de vos produits, par entrepôt. Il enregistre tous les mouvements (entrées, sorties, transferts, ajustements) avec leur date, leur raison et l'utilisateur qui les a effectués.

> **Note :** seuls les **produits physiques** (et non les services) sont concernés par la gestion de stock. Les services n'ayant pas de quantité tangible, leur compteur reste à zéro et ne déclenche aucun mouvement.

## Consulter le stock d'un produit

Ouvrez la fiche d'un [produit](produits.md). Dans l'onglet **Stock**, vous voyez :

- La **quantité totale** disponible, tous entrepôts confondus
- La **répartition par entrepôt**
- L'historique des mouvements, du plus récent au plus ancien

## Consulter le stock d'un entrepôt

Ouvrez la fiche d'un [entrepôt](entrepots.md). Vous voyez la liste des produits stockés à cet endroit avec leur quantité.

## Enregistrer un mouvement

Depuis la fiche d'un produit, touchez **Nouveau mouvement** dans l'onglet stock. Le formulaire vous demande :

- **Type de mouvement** :
  - **Entrée** : réception de marchandise, retour client
  - **Sortie** : expédition, casse, perte
  - **Transfert** : déplacement entre deux entrepôts
  - **Ajustement** : correction d'inventaire (positif ou négatif)
- **Entrepôt source** (pour sortie, transfert ou ajustement négatif)
- **Entrepôt destination** (pour entrée, transfert ou ajustement positif)
- **Quantité**
- **Prix unitaire pondéré** (PMP) -- pour les entrées, c'est le prix d'achat utilisé pour valoriser le stock
- **Libellé** -- raison du mouvement (par exemple "Retour client commande C2026-0042", "Inventaire annuel", "Casse atelier")

Validez avec **Enregistrer**. Le stock est immédiatement mis à jour.

## Mouvements automatiques

Certains mouvements sont déclenchés automatiquement par Dolipocket :

- **Validation d'une facture client** -> sortie de stock pour les produits facturés
- **Validation d'une réception de commande fournisseur** -> entrée de stock
- **Annulation d'une facture déjà validée** -> entrée compensatoire (retour en stock)

Vous n'avez pas à enregistrer ces mouvements manuellement : ils apparaissent dans l'historique avec une mention indiquant le document à l'origine.

## Inventaire physique

Périodiquement (au moins une fois par an, idéalement plusieurs fois), comparez le stock théorique de Dolipocket avec ce qui est réellement présent dans votre entrepôt. Pour chaque écart constaté :

1. Ouvrez la fiche du produit concerné
2. Créez un mouvement de type **Ajustement**
3. Saisissez la quantité réelle moins la quantité théorique (positif si vous trouvez plus de pièces, négatif si vous en trouvez moins)
4. Indiquez clairement dans le libellé qu'il s'agit d'un inventaire (par exemple "Inventaire 2026-12 -- écart constaté")

L'historique conservera la trace de ces ajustements pour audit ultérieur.

## Stocks négatifs

Par défaut, Dolipocket interdit qu'un stock devienne négatif : vous ne pouvez pas sortir 10 pièces d'un entrepôt qui n'en contient que 7. Le système refuse l'opération et affiche un message d'erreur.

Si vous travaillez en flux tendu et avez besoin de **vendre avant d'avoir reçu**, vous pouvez activer la tolérance des stocks négatifs dans la configuration. Réservez ce réglage aux cas où c'est vraiment indispensable : les stocks négatifs masquent souvent des erreurs de saisie.

## Bonnes pratiques

- **Enregistrez les mouvements en temps réel** plutôt que de les regrouper en fin de journée : c'est moins de risques d'oubli
- **Utilisez le libellé** pour tracer la raison : "Casse", "Don", "Promotion", "Inventaire". Vous vous féliciterez d'avoir été précis quand vous referez l'historique six mois plus tard.
- **Inventoriez régulièrement** : un écart de quelques pièces se corrige facilement, un écart de plusieurs centaines est ingérable
- **Distinguez transfert et ajustement** : un transfert garde la quantité globale identique (sortie d'un entrepôt, entrée dans un autre), un ajustement modifie la quantité totale
