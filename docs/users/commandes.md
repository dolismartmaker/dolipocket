---
title: "Commandes client"
weight: 100
description: "Gérer les commandes client validées et leur conversion en facture."
---

# Commandes client

Une **commande client** matérialise un engagement ferme entre votre société et un client, en général après acceptation d'un [devis](devis.md). Elle sert à préparer la livraison ou la prestation, et donne lieu à une ou plusieurs [factures](factures.md) lors de la facturation.

Toutes les activités n'utilisent pas l'étape commande : si vous facturez directement après acceptation du devis, vous pouvez sauter cette étape et créer la facture depuis le devis. La commande prend tout son sens quand un délai existe entre l'engagement et la facturation (livraison de produits, prestation longue, échéances multiples).

## Accéder aux commandes

Depuis le menu principal, touchez **Commandes**. La liste affiche toutes vos commandes client, leur référence (par exemple `CO2026-0001`), le client, la date, le montant et le statut.

## Créer une commande

Trois manières d'arriver sur une commande :

1. **Depuis un devis signé** : touchez **Convertir en commande** sur la fiche du devis. Toutes les lignes sont reprises automatiquement.
2. **Depuis la liste des commandes** : touchez **Nouvelle commande**, choisissez le client, puis ajoutez les lignes une à une (interface identique à celle d'un devis).
3. **Depuis la fiche d'un tiers** : utilisez le bouton **Nouvelle commande** dans l'onglet commercial du tiers.

## Gestion des lignes

Comme pour un devis, chaque ligne porte un produit ou service, une quantité, un prix unitaire HT, une remise éventuelle et un taux de TVA. Vous pouvez insérer des lignes de titre et des sous-totaux pour structurer le document.

## Valider la commande

Touchez **Valider** pour passer la commande du statut **Brouillon** à **Validée**. La référence devient définitive. Une commande validée n'est plus modifiable directement ; pour la corriger, repassez-la en brouillon.

## Statuts d'une commande

| Statut | Signification |
|--------|---------------|
| Brouillon | En cours de saisie |
| Validée | Engagement formel, prête à exécuter |
| En cours d'exécution | Au moins une livraison ou facturation partielle a eu lieu |
| Livrée | Toute la commande a été livrée |
| Facturée | Toutes les lignes ont été facturées |
| Annulée | Commande abandonnée avant exécution complète |

## Facturer une commande

Une fois la commande validée (et éventuellement après la livraison effective des produits), touchez **Créer une facture**. Dolipocket vous propose deux options :

- **Facturer en totalité** : la facture reprend toutes les lignes pour la totalité de leurs quantités
- **Facturer partiellement** : vous choisissez les lignes et les quantités à facturer (utile pour la facturation à l'avancement, les acomptes ou les livraisons fractionnées)

La facture est créée en statut Brouillon. Vous pouvez l'ajuster avant validation.

## Annuler une commande

Si une commande est abandonnée avant exécution, ouvrez le menu d'actions et touchez **Annuler la commande**. Une raison peut être saisie pour traçabilité. La commande reste consultable mais ne génère plus de facture.

> **Attention :** annuler une commande déjà facturée nécessite d'abord d'avoir un avoir (note de crédit) sur la facture émise. Sinon vous gardez une dette client erronée.

## Bonnes pratiques

- **Conservez la traçabilité devis -> commande -> facture** : chaque document fait référence au précédent, ce qui simplifie les recherches a posteriori
- **Datez précisément la commande** : c'est cette date qui sert souvent de référence pour les délais contractuels (livraison sous 30 jours à compter de la commande)
- **Utilisez les notes** pour les instructions internes (référence interne du client, contraintes logistiques, contact à prévenir avant livraison)
- **Facturez à l'avancement** pour les prestations longues : ne facturez pas tout à la fin si vous pouvez encaisser des échéances intermédiaires
