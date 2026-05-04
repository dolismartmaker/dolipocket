---
title: "Entrepôts"
weight: 70
description: "Organiser vos lieux de stockage dans Dolipocket."
---

# Entrepôts

Un **entrepôt** est un lieu de stockage physique : votre local commercial, un stock à domicile, une réserve déportée, le coffre d'un véhicule pour un commercial itinérant. Dolipocket vous permet d'en gérer plusieurs en parallèle et de connaître les niveaux de stock par entrepôt.

Si vous n'avez qu'un seul lieu, Dolipocket en crée un par défaut nommé **Entrepôt principal** lors de l'activation de votre compte. Vous pouvez le renommer ou le supprimer (si aucun stock n'y est attaché) une fois votre organisation définie.

## Accéder aux entrepôts

Depuis le menu principal, touchez **Entrepôts**. La liste affiche tous vos lieux de stockage avec leur nom, adresse et statut (actif / désactivé).

## Créer un entrepôt

Touchez **Nouvel entrepôt** et renseignez :

- **Référence** -- code court pour identifier l'entrepôt (par exemple `ENT-PARIS`, `ENT-LYON`)
- **Nom** -- libellé descriptif (par exemple "Boutique principale")
- **Description** -- texte libre
- **Adresse, code postal, ville, pays** -- localisation physique
- **Statut** -- ouvert ou fermé

Validez avec **Enregistrer**.

## Hiérarchie d'entrepôts

Dolipocket supporte une organisation hiérarchique : un entrepôt peut avoir un entrepôt parent. Cela vous permet de modéliser des sous-zones (par exemple un entrepôt principal avec plusieurs allées ou plusieurs étagères, chacune étant un sous-entrepôt).

Pour créer un sous-entrepôt :

1. Créez d'abord l'entrepôt parent
2. Créez le sous-entrepôt et choisissez le parent dans le champ **Entrepôt parent**

La consultation du stock peut alors agréger les sous-entrepôts dans le total du parent.

## Modifier un entrepôt

Depuis la fiche, touchez **Modifier**, ajustez les champs voulus, puis validez.

> **Attention :** ne changez pas la **référence** d'un entrepôt déjà utilisé : cette référence apparaît sur les bons de mouvement de stock et l'historique deviendrait illisible. Si vous voulez changer la référence, créez un nouvel entrepôt et désactivez l'ancien.

## Désactiver ou supprimer un entrepôt

- **Désactiver** : passez le statut à **Fermé**. L'entrepôt n'apparaît plus dans les listes de sélection lors d'un mouvement de stock, mais l'historique reste consultable.
- **Supprimer** : possible uniquement si l'entrepôt ne contient aucun stock et n'a jamais été utilisé pour un mouvement.

Pour vider un entrepôt avant suppression, transférez le stock vers un autre lieu via un [mouvement d'inventaire](stock.md).

## Bonnes pratiques

- **Démarrez simple** : un seul entrepôt suffit pour la majorité des activités. N'ajoutez de la complexité que quand vous gérez réellement plusieurs lieux distincts.
- **Adresse complète** : si vous expédiez depuis cet entrepôt, renseignez l'adresse complète : elle pourra apparaître sur les bons de livraison
- **Utilisez la hiérarchie avec parcimonie** : trois ou quatre niveaux maximum. Au-delà, la navigation devient pénible sur mobile.
