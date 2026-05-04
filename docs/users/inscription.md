---
title: "Inscription"
weight: 10
description: "Créer un compte Dolipocket avec vérification par code OTP."
---

# Inscription à Dolipocket

L'inscription se déroule en trois étapes courtes : saisie des informations, vérification par code reçu par courriel, et choix d'un mot de passe. À la fin du parcours, votre espace Dolibarr personnel est immédiatement disponible.

## Étape 1 : remplir le formulaire d'inscription

Rendez-vous sur la page d'accueil de Dolipocket, puis cliquez sur **S'inscrire**. Le formulaire vous demande deux informations :

- **Email** -- l'adresse qui servira d'identifiant de connexion. Elle doit être valide car un code de vérification y sera envoyé immédiatement.
- **Nom de société** -- le nom commercial qui apparaîtra sur vos devis et factures. Vous pourrez le modifier plus tard depuis la configuration de Dolibarr.

Validez le formulaire. Un message vous confirme que le code a été envoyé.

> **Important :** une seule adresse email peut correspondre à un seul compte. Si vous tentez de vous inscrire avec un email déjà utilisé, le système refuse l'inscription et vous invite à utiliser la page de récupération de mot de passe.

## Étape 2 : valider le code OTP

Consultez votre boîte de réception. Vous recevez en quelques secondes un courriel contenant un code à 6 chiffres. Ce code est valable pendant **15 minutes**.

Sur la page de vérification :

1. Saisissez le code reçu dans le champ prévu
2. Choisissez un mot de passe robuste (au moins 8 caractères, mélange de lettres, chiffres et symboles recommandé)
3. Confirmez le mot de passe
4. Cliquez sur **Activer mon compte**

> **Si vous n'avez rien reçu :** vérifiez vos courriers indésirables. Le code peut prendre jusqu'à deux minutes en cas de surcharge du service de messagerie. Au-delà, recommencez l'inscription depuis le début ; l'ancien code est automatiquement invalidé.

## Étape 3 : votre espace est prêt

À l'activation, Dolipocket crée pour vous :

- Une **entité Dolibarr dédiée** isolée de tous les autres comptes
- Un **utilisateur administrateur** correspondant à votre adresse email
- Les **dossiers de stockage** pour vos pièces jointes
- Les **paramètres par défaut** : devise euro, langue française, modèles de numérotation activés

Vous êtes ensuite redirigé vers l'écran de connexion. Saisissez votre email et le mot de passe choisi pour entrer dans votre espace de travail.

## Que se passe-t-il après la première connexion ?

Au premier login, vous arrivez directement dans la PWA Dolipocket. Avant de commencer à travailler, prenez le temps de :

- Renseigner les coordonnées complètes de votre société dans la configuration (adresse, SIRET, numéro de TVA)
- Configurer un compte bancaire si vous prévoyez d'enregistrer des paiements
- Créer vos premiers [tiers](tiers.md) (clients et fournisseurs)
- Saisir votre catalogue de [produits et services](produits.md)

Pour retrouver Dolipocket facilement, pensez à [installer la PWA](installation-pwa.md) sur l'écran d'accueil de votre smartphone.
