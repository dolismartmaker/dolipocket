---
title: "Factures client"
weight: 110
description: "Émettre des factures client, suivre les paiements et gérer les avoirs."
---

# Factures client

Une **facture client** est un document à valeur légale et comptable. Elle constate la créance que vous avez sur le client et déclenche son obligation de paiement. C'est le document final du cycle de vente.

## Accéder aux factures

Depuis le menu principal, touchez **Factures**. La liste affiche toutes vos factures avec leur référence (par exemple `FA2026-0001`), le client, la date d'émission, la date d'échéance, le montant TTC et le statut.

Filtres rapides disponibles :

- **Brouillons** : en cours de saisie
- **À encaisser** : validées mais non payées
- **Payées** : intégralement réglées
- **En retard** : échéance dépassée et non payées
- **Toutes**

## Créer une facture

Quatre points d'entrée :

1. **Depuis une commande validée** : touchez **Créer une facture** pour reprendre les lignes
2. **Depuis un devis signé** : touchez **Convertir en facture** (si vous sautez l'étape commande)
3. **Depuis la liste des factures** : touchez **Nouvelle facture** et saisissez tout manuellement
4. **Depuis la fiche d'un tiers** : bouton **Nouvelle facture** dans l'onglet commercial

Choisissez :

- Le **client** (bloqué si la facture provient d'un devis ou d'une commande)
- Le **type** : facture standard, avoir (note de crédit), facture d'acompte
- La **date** de facture
- La **date d'échéance** (par défaut J+30, modifiable)
- Les **conditions de règlement** : à la commande, à 30 jours, à 30 jours fin de mois, etc.
- Le **mode de règlement** prévu : virement, chèque, carte, etc.

Ajoutez ensuite les lignes (mêmes possibilités qu'un devis) et touchez **Valider** quand le contenu est finalisé.

> **Attention :** une fois validée, la facture obtient une référence définitive et ne peut plus être modifiée. C'est une obligation légale (numérotation continue). Pour corriger une facture validée, vous devez émettre un avoir et créer une nouvelle facture.

## Envoyer la facture

Touchez **Envoyer par email**. Le PDF est joint automatiquement. Vous pouvez aussi télécharger le PDF pour le transmettre par un autre canal ou l'imprimer.

## Enregistrer un paiement

Quand le client règle (totalement ou partiellement), enregistrez le paiement :

1. Ouvrez la fiche de la facture
2. Touchez **Enregistrer un paiement**
3. Saisissez :
   - Le **montant** reçu (par défaut le total dû)
   - La **date** de paiement
   - Le **mode** : virement, chèque, espèces, carte
   - Le **compte bancaire** crédité
   - La **référence** (numéro de chèque, libellé virement)
4. Validez

Le statut de la facture passe de **À encaisser** à **Payée** si le règlement couvre la totalité, ou à **Partiellement payée** si le montant reçu est inférieur. Vous pouvez enregistrer plusieurs paiements successifs jusqu'au solde complet.

## Statuts d'une facture

| Statut | Signification |
|--------|---------------|
| Brouillon | En cours de saisie, non valable légalement |
| Validée -- À encaisser | Émise et en attente de paiement |
| Validée -- Partiellement payée | Un ou plusieurs paiements partiels enregistrés |
| Payée | Solde à zéro |
| En retard | Échéance dépassée, solde non couvert |
| Abandonnée | Considérée comme irrécouvrable (passage en perte) |

## Avoirs (notes de crédit)

Pour annuler ou corriger une facture déjà validée :

1. Ouvrez la facture concernée
2. Touchez **Créer un avoir**
3. L'avoir reprend toutes les lignes en quantité négative ; ajustez si vous ne corrigez qu'une partie
4. Validez l'avoir

L'avoir vient s'imputer sur le compte client. Si le client avait déjà payé la facture initiale, vous lui devez maintenant la somme correspondante : enregistrez un remboursement ou imputez l'avoir sur une facture suivante.

## Relances

Pour relancer un client en retard :

1. Filtrez la liste sur **En retard**
2. Ouvrez la facture
3. Touchez **Envoyer par email** avec un objet et un corps adapté à la relance

> **Astuce :** créez des modèles d'email pré-rédigés pour la première, deuxième et troisième relance. Vous gagnerez du temps et garderez un ton cohérent.

## Facture d'acompte

Pour facturer un acompte avant la livraison définitive :

1. Sur la commande, touchez **Créer une facture d'acompte**
2. Saisissez le pourcentage ou le montant fixe de l'acompte
3. Validez et envoyez

Lors de la facture finale, l'acompte sera automatiquement déduit pour ne facturer que le solde.

## Bonnes pratiques

- **Numérotez en continu** sans trous : Dolipocket le fait automatiquement, ne contournez pas le système
- **Conservez 10 ans** : les factures restent stockées dans Dolipocket même après archivage. Téléchargez régulièrement une sauvegarde des PDF.
- **Suivez les retards** : un client qui dépasse son échéance doit être relancé sous 8 jours
- **Émettez vite** : facturez dans la foulée de la livraison ou de la fin de prestation. Plus le délai entre prestation et facture est long, plus le délai de paiement s'allonge.
