---
title: "Documents (GED)"
weight: 150
description: "Joindre des documents aux objets métier dans Dolipocket."
---

# Gestion électronique des documents

Dolipocket intègre une **GED** (gestion électronique des documents) qui vous permet d'attacher des fichiers à n'importe quel objet métier : tiers, contact, devis, commande, facture, événement d'agenda. Les documents sont stockés sur le serveur, dans un espace propre à votre entité, et restent accessibles à toute personne ayant accès à l'objet auquel ils sont liés.

C'est l'endroit idéal pour conserver :

- Les **PDF de devis et factures** générés par Dolipocket
- Les **factures fournisseur** que vous recevez
- Les **bons de livraison** signés par le client
- Les **contrats** et **conditions générales**
- Les **photos d'avancement** d'un chantier
- Tout autre justificatif (KBIS, attestation, justificatif de paiement)

## Joindre un document

Sur la fiche de n'importe quel objet (tiers, devis, facture, etc.), touchez l'onglet **Documents**. Touchez **Téléverser un fichier**.

Plusieurs méthodes sont possibles selon votre appareil :

- **Sélection depuis la galerie** : pour des photos déjà prises
- **Prise de photo immédiate** : la PWA active la caméra de votre téléphone et permet de capturer le document directement
- **Sélection depuis le système de fichiers** : pour les PDF et autres documents bureautiques
- **Glisser-déposer** : sur ordinateur, faites glisser le fichier sur la zone d'upload

L'upload s'effectue en arrière-plan. Une fois terminé, le fichier apparaît dans la liste des documents de l'objet.

## Formats supportés

Les principaux formats sont acceptés :

- **Images** : JPEG, PNG, WebP, HEIC (les iPhones)
- **PDF**
- **Documents bureautiques** : ODT, ODS, DOCX, XLSX
- **Texte brut** : TXT, CSV
- **Archives** : ZIP, TAR
- **Autres** : tout format raisonnable jusqu'à la limite de taille configurée

La taille maximale par fichier est de **10 Mo** par défaut (modifiable par l'opérateur du service en cas de besoin spécifique).

## Télécharger un document

Touchez le nom du fichier dans la liste pour le télécharger sur votre appareil. Sur mobile, l'aperçu peut s'ouvrir directement dans le navigateur (notamment pour les PDF et les images).

## Supprimer un document

Touchez l'icône **Supprimer** (corbeille) à côté du fichier. Une confirmation est demandée.

> **Attention :** la suppression est définitive. Aucune corbeille n'est mise en place. Pensez à télécharger une copie locale si vous avez le moindre doute avant de supprimer.

## Renommer un document

Touchez l'icône **Renommer** (crayon) puis saisissez le nouveau nom. Le contenu reste identique, seul le libellé change.

## Types d'objets supportés

La GED est disponible sur :

- **Tiers** -- contrats, attestations, fiches client
- **Contacts** -- carte de visite scannée, certifications
- **Produits** -- fiches techniques, photos produit, manuels
- **Devis** -- conditions particulières, croquis annexes
- **Commandes client** -- bons de commande signés
- **Factures client** -- PDF générés par Dolipocket, justificatifs liés
- **Commandes fournisseur** -- bons de livraison
- **Factures fournisseur** -- PDF reçu du fournisseur (très important : c'est votre justificatif comptable)
- **Événements d'agenda** -- comptes rendus, présentations, photos prises lors d'une visite

## Documents générés automatiquement

Quand vous validez un devis, une commande ou une facture, Dolipocket génère automatiquement le **PDF** correspondant et le stocke dans l'onglet Documents de cet objet. Vous n'avez pas à le téléverser : il apparaît tout seul.

Si vous regénérez le PDF (par exemple après un changement de modèle de document), l'ancien est conservé en archive et la version la plus récente est mise en avant.

## Stockage et confidentialité

Les fichiers sont stockés dans un dossier propre à votre entité, isolé de tous les autres comptes Dolipocket. Personne en dehors des utilisateurs de votre entité n'y a accès.

Les sauvegardes sont effectuées automatiquement par l'opérateur du service.

## Bonnes pratiques

- **Joignez les justificatifs au moment de la saisie** : c'est plus facile que de devoir les retrouver dans une pile six mois plus tard
- **Nommez clairement** vos fichiers avant de les téléverser : `Facture-Fournisseur-EDF-2026-04.pdf` plutôt que `IMG_1234.jpg`
- **Photographiez en bonne lumière** les documents papier pour qu'ils restent lisibles à l'archive
- **Ne stockez pas n'importe quoi** : la GED de Dolipocket n'est pas un Dropbox personnel. Réservez-la aux documents liés à votre activité.
