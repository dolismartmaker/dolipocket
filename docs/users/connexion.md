---
title: "Connexion"
weight: 20
description: "Se connecter à Dolipocket et récupérer un mot de passe oublié."
---

# Connexion à Dolipocket

## Se connecter

Rendez-vous sur la page d'accueil de Dolipocket et cliquez sur **Connexion**. Saisissez :

- Votre **email** (celui utilisé lors de l'[inscription](inscription.md))
- Votre **mot de passe**

Cliquez sur **Se connecter**. Le système vérifie vos identifiants et vous redirige automatiquement vers la PWA Dolipocket avec votre session active.

> **Astuce :** la PWA mémorise votre session via un jeton sécurisé. Vous restez connecté tant que vous ne vous déconnectez pas explicitement, même après avoir fermé le navigateur.

## Identifiant unique

Votre adresse email sert d'identifiant de connexion sur toute la plateforme Dolipocket. Une même adresse correspond à un seul espace de travail. Si vous gérez plusieurs sociétés, vous devez créer un compte séparé pour chacune avec une adresse différente (par exemple en utilisant les alias `votre-email+societe1@domaine.fr` et `votre-email+societe2@domaine.fr` si votre fournisseur de messagerie le supporte).

## Mot de passe oublié

Si vous ne vous souvenez plus de votre mot de passe, cliquez sur le lien **Mot de passe oublié ?** depuis l'écran de connexion.

1. Saisissez l'adresse email associée à votre compte
2. Validez le formulaire
3. Consultez votre boîte de réception : un courriel contenant un lien de réinitialisation y est envoyé
4. Cliquez sur le lien (valable 30 minutes) pour ouvrir le formulaire de nouveau mot de passe
5. Saisissez deux fois votre nouveau mot de passe et validez

Vous pouvez ensuite vous reconnecter immédiatement avec ces nouveaux identifiants.

> **Si vous n'avez rien reçu :** vérifiez vos courriers indésirables. Si l'adresse saisie n'existe pas dans Dolipocket, aucun courriel n'est envoyé (par sécurité, le système ne révèle pas si un compte existe ou non).

## Déconnexion

Pour fermer votre session, ouvrez le menu utilisateur en haut à droite de la PWA et cliquez sur **Déconnexion**. Vous serez ramené à l'écran de connexion. Pensez à vous déconnecter si vous utilisez un appareil partagé.

## Problèmes de connexion

### Erreur "Identifiants invalides"

- Vérifiez la casse de votre adresse email (les emails sont normalement insensibles à la casse, mais la prudence est de mise)
- Vérifiez que vous n'avez pas une majuscule activée par erreur sur votre clavier mobile
- Utilisez la procédure de mot de passe oublié si le doute persiste

### Erreur "Compte désactivé"

Votre compte a été désactivé par l'opérateur du service. Contactez le [support](https://cap-rel.fr/contact/) pour comprendre la raison et réactiver votre accès.

### Boucle de redirection après connexion

Videz le cache et les cookies de votre navigateur pour le domaine Dolipocket, puis reconnectez-vous. Si le problème persiste, essayez en navigation privée pour isoler la cause.
