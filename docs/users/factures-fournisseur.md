---
title: "Factures fournisseur"
weight: 130
description: "Saisir les factures reçues de vos fournisseurs et suivre les paiements sortants."
---

# Factures fournisseur

Une **facture fournisseur** est un document que vous **recevez** de la part d'un fournisseur et que vous saisissez dans Dolipocket pour le suivi de vos achats et de votre trésorerie. À la différence des factures client (que vous émettez), c'est ici l'autre partie qui détient la créance et vous qui devez payer.

Saisir vos factures fournisseur dans Dolipocket vous permet de :

- Connaître votre **dette fournisseur** à tout moment
- Suivre les **échéances** et anticiper les paiements
- Calculer la **TVA déductible**
- Disposer de **statistiques d'achat** (par fournisseur, par catégorie, par période)

## Accéder aux factures fournisseur

Depuis le menu principal, touchez **Factures fournisseur**. La liste affiche toutes vos factures d'achat avec leur référence interne (par exemple `FF2026-0001`), le fournisseur, la date, le montant TTC et le statut de paiement.

## Saisir une nouvelle facture fournisseur

Deux points d'entrée :

1. **Depuis une commande fournisseur reçue** : touchez **Créer une facture fournisseur** sur la commande. Les lignes sont reprises automatiquement, vous n'avez plus qu'à indiquer la date de la facture et la référence fournisseur.
2. **Sans commande préalable** (achats sur facture directe) : touchez **Nouvelle facture fournisseur** depuis la liste.

Renseignez :

- Le **fournisseur**
- La **référence fournisseur** -- le numéro qui figure sur la facture papier ou PDF reçue (champ obligatoire)
- La **date d'émission** indiquée par le fournisseur
- La **date d'échéance** indiquée par le fournisseur (généralement 30 ou 60 jours après l'émission)
- Les **conditions** et le **mode de règlement** prévus

Ajoutez les lignes en reprenant fidèlement ce qui figure sur la facture du fournisseur :

- Produit ou service du catalogue, ou description libre
- Quantité
- Prix unitaire HT
- Taux de TVA
- Compte comptable d'imputation (si vous tenez votre comptabilité dans Dolibarr)

Validez la facture quand la saisie est conforme à l'original reçu.

## Joindre la facture originale

Sur la fiche, touchez **Joindre un document** pour téléverser le PDF reçu du fournisseur. Vous gardez ainsi le justificatif lié à la facture, accessible directement depuis Dolipocket. Voir [Documents](documents.md).

## Enregistrer un paiement

Quand vous payez la facture (par virement, chèque ou prélèvement), enregistrez le paiement :

1. Ouvrez la fiche de la facture
2. Touchez **Enregistrer un paiement**
3. Saisissez :
   - Le **montant** (par défaut le total dû)
   - La **date** réelle de paiement
   - Le **mode** de règlement
   - Le **compte bancaire** débité
   - La **référence** (numéro de chèque, libellé virement)
4. Validez

Le statut passe à **Payée** quand le solde atteint zéro.

## Statuts d'une facture fournisseur

| Statut | Signification |
|--------|---------------|
| Brouillon | En cours de saisie |
| Validée -- À payer | Saisie validée, en attente de règlement |
| Partiellement payée | Un ou plusieurs paiements partiels enregistrés |
| Payée | Solde à zéro |
| En retard | Échéance dépassée, solde non couvert |
| Abandonnée | Considérée comme non due (litige résolu en votre faveur) |

## Avoir fournisseur

Si le fournisseur vous adresse un avoir (par exemple suite à un retour, un litige ou une remise rétroactive), saisissez-le comme une facture de type **Avoir** avec un montant négatif. L'avoir vient s'imputer sur les factures suivantes ou donne lieu à un remboursement.

## Litiges et écarts

Si vous constatez un écart entre la facture reçue et la commande (prix différent, quantité erronée, article non livré) :

1. Saisissez quand même la facture pour ne pas la perdre
2. Notez l'écart dans le champ **Note interne**
3. Contactez le fournisseur pour obtenir un avoir ou une facture rectificative
4. Saisissez l'avoir reçu une fois le litige résolu

## Bonnes pratiques

- **Saisissez à réception** : ne laissez pas s'accumuler les factures sur votre bureau. Une saisie à chaud, c'est moins de risque d'oubli ou de double règlement
- **Joignez systématiquement le PDF original** : c'est votre justificatif en cas de contrôle
- **Vérifiez la concordance avec la commande** avant de payer : le prix et la quantité facturés doivent correspondre à ce qui a été réceptionné
- **Anticipez les paiements** : utilisez les filtres de la liste pour voir les factures dont l'échéance approche dans les 7 prochains jours
- **Catégorisez avec les comptes comptables** dès la saisie : vous gagnerez du temps lors de l'export comptable de fin de période
