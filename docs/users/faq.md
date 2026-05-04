---
title: "Questions fréquentes"
weight: 200
description: "Réponses aux questions les plus courantes sur Dolipocket."
---

# Questions fréquentes

## J'ai oublié mon mot de passe, comment faire ?

Depuis l'écran de [connexion](connexion.md), cliquez sur **Mot de passe oublié ?**, saisissez votre adresse email, et suivez le lien de réinitialisation envoyé par courriel. Le lien est valable 30 minutes.

## Je n'ai pas reçu le code OTP d'inscription. Que faire ?

Vérifiez d'abord vos courriers indésirables. Si après deux minutes le code n'est toujours pas arrivé, recommencez l'inscription depuis le début : un nouveau code sera envoyé. Si le problème se reproduit, contactez le support en précisant l'adresse utilisée.

## Le code OTP est expiré, comment recommencer ?

Le code OTP est valable 15 minutes. Au-delà, recommencez l'inscription : un nouveau code remplacera l'ancien.

## Puis-je avoir plusieurs sociétés sur un même compte ?

Non. Chaque inscription crée une **entité isolée** correspondant à une seule société. Si vous gérez plusieurs structures, créez un compte par société avec une adresse email différente. Vous pouvez utiliser les alias `votre-email+s1@domaine.fr`, `votre-email+s2@domaine.fr` si votre fournisseur de messagerie le supporte.

## Plusieurs personnes peuvent-elles utiliser le même compte ?

Oui. Une fois votre entité créée, vous pouvez ajouter d'autres utilisateurs (collaborateurs, comptable, partenaire). Chacun aura son propre identifiant et son propre mot de passe, mais tous travailleront dans la même entité, sur les mêmes données. Cela se gère depuis la configuration de l'utilisateur dans les paramètres de Dolibarr.

## Puis-je désinstaller la PWA sans perdre mes données ?

Oui, sans aucun risque. La PWA installée sur votre téléphone est juste un raccourci vers le service ; toutes vos données sont stockées sur le serveur. Désinstaller, réinstaller, changer de téléphone : tout reste accessible avec votre identifiant.

## Comment supprimer mon compte ?

Contactez le support à l'adresse mentionnée sur le site. La suppression est définitive et irréversible : toutes les données de votre entité (tiers, factures, documents) sont effacées sans possibilité de récupération. Pensez à exporter vos factures et justificatifs avant de demander la suppression.

## Mes données sont-elles sauvegardées ?

Oui. L'opérateur du service effectue des sauvegardes automatiques régulières. Cependant, votre responsabilité reste engagée : exportez et conservez localement les documents importants (factures émises, factures fournisseur, justificatifs comptables) au moins une fois par an.

## Mes données peuvent-elles être consultées par d'autres clients de Dolipocket ?

Non. Chaque entité est strictement isolée des autres. Aucun utilisateur d'une autre entité ne peut voir vos tiers, vos factures, vos documents. C'est garanti par l'architecture multi-tenant du service.

## Puis-je migrer mes données depuis un autre Dolibarr ?

Une migration manuelle reste possible via les imports CSV de Dolibarr (tiers, contacts, produits). Les documents et l'historique transactionnel ne sont en revanche pas reprenables automatiquement. Pour des migrations complexes, contactez le support qui pourra vous orienter.

## Pourquoi ma facture ne s'envoie-t-elle pas par email ?

Vérifiez que vous avez bien renseigné l'adresse email du contact destinataire sur la fiche du tiers. Si l'adresse est correcte, vérifiez le journal d'envoi : un message d'erreur peut indiquer un problème côté serveur SMTP. Contactez le support si l'erreur persiste.

## Comment changer la devise par défaut ?

La devise est définie au moment de la création de votre entité (par défaut l'euro). Pour la modifier, allez dans la configuration de Dolibarr et changez le paramètre **Devise principale**. Attention : changer la devise après avoir émis des factures peut créer des incohérences. Faites-le dès le début si possible.

## Puis-je personnaliser le modèle de mes factures (logo, couleurs) ?

Oui. Téléversez votre logo dans la configuration de la société, puis choisissez un modèle de facture compatible (Crabe, Sponge, etc.). Les couleurs et la mise en page peuvent varier selon le modèle. Le détail de cette personnalisation est documenté dans la documentation officielle de Dolibarr (Dolipocket repose sur Dolibarr standard).

## La PWA fonctionne-t-elle hors ligne ?

Partiellement. La PWA garde en cache les ressources statiques (interface, icônes) pour s'afficher rapidement. En revanche, les données métier (tiers, factures) nécessitent une connexion : sans réseau, vous ne pourrez ni consulter vos factures ni en créer.

## Y a-t-il une application Android ou iOS native sur les stores ?

Non. Dolipocket est exclusivement une PWA. C'est volontaire : pas de validation à attendre des stores, pas de mise à jour à télécharger, déploiement immédiat des nouveautés. L'expérience utilisateur reste très proche d'une application native, surtout après [installation sur l'écran d'accueil](installation-pwa.md).

## Combien coûte le service ?

Les conditions tarifaires sont précisées sur le site public de Dolipocket à la page **Tarifs**. Pour des besoins spécifiques (volume d'utilisateurs, options sur mesure), contactez le service commercial.

## Le service est-il conforme RGPD ?

Le service est hébergé en Europe et respecte les obligations du règlement général sur la protection des données. Vous restez **responsable du traitement** des données que vous saisissez (clients, contacts, factures), l'éditeur étant **sous-traitant** au sens du RGPD. Pour exercer vos droits ou ceux de vos clients, contactez l'éditeur.

## Comment contacter le support ?

Utilisez le [formulaire de contact](https://cap-rel.fr/contact/) ou écrivez directement à l'adresse de support indiquée sur la page **À propos** dans la configuration de votre Dolipocket. Le délai de réponse habituel est d'un jour ouvré.
