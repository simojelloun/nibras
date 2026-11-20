# IslamQuizz (نِبراس) — application Android, iOS et web

Quiz islamique en arabe : 1 373 questions, 8 thèmes, 7 modes de jeu, comptes joueurs,
classement, ligues, groupes et duels par code.

## Ce que contient le dossier

| Dossier | Rôle |
|---|---|
| `www/` | L'application elle-même. Le même code sert au web, à Android et à iOS. |
| `server/` | Le serveur : API (comptes, classement, groupes, duels) et base de données. Sert aussi la version web. |
| `android/` | Projet Android Studio, déjà généré. |
| `ios/` | Projet Xcode, déjà généré. |
| `assets/logo.png` | Image source de l'icône et de l'écran de démarrage. |
| `capacitor.config.json` | Nom de l'application et identifiant (`com.islamquizz.nibras`). |

L'application mobile est construite avec Capacitor : c'est l'application web, emballée dans une
coquille native pour chaque store.

## Étape 1 — Mettre le serveur en ligne (une seule fois)

Le plus simple sur Mac : double-cliquez sur `Deployer.command` à la racine du dossier. Il fait tout ce
qui suit et affiche l'adresse de l'application. Si macOS refuse de l'ouvrir : clic droit, puis « Ouvrir »,
ou lancez `bash Deployer.command` dans un terminal.

À la main :

Prérequis : Node.js 22 ou plus récent, et votre compte Cloudflare.

```sh
cd server
npm install
npx wrangler login
npx wrangler deploy
```

La dernière commande affiche une adresse du type `https://islamquizz.<votre-compte>.workers.dev`.
Cette adresse est à la fois la version web jouable et le serveur de l'application mobile.

La base de données `islamquizz` existe déjà sur votre compte, avec ses tables. Rien à créer.

## Étape 2 — Indiquer l'adresse du serveur à l'application

Ouvrez `www/config.js` et collez l'adresse obtenue :

```js
window.IQ_API = "https://islamquizz.<votre-compte>.workers.dev";
```

Puis, à la racine du dossier :

```sh
npm install
npx cap sync
```

Sans cette adresse, l'application mobile fonctionne quand même, mais hors ligne : pas de compte,
pas de classement, pas de groupes ni de duels par code.

## Étape 3 — Android

Prérequis : Android Studio (version Otter 2025.2.1 ou plus récente).

```sh
npx cap open android
```

Dans Android Studio : bouton « Run » pour tester sur un téléphone ou un émulateur.
Pour le Play Store : menu Build > Generate Signed App Bundle, puis envoi du fichier `.aab`
dans la Google Play Console (compte développeur : 25 $ une fois).

## Étape 4 — iOS

Prérequis : un Mac avec Xcode 26 ou plus récent, et un compte Apple Developer (99 $ par an)
pour publier.

```sh
npx cap open ios
```

Dans Xcode : choisissez votre équipe dans « Signing & Capabilities », puis « Run » pour tester.
Pour l'App Store : menu Product > Archive, puis « Distribute App ».

## Après chaque modification de `www/`

```sh
npx cap sync                      # recopie l'application dans android/ et ios/
cd server && npx wrangler deploy  # met à jour la version web
```

## Avant de publier sur les stores

- **Identifiant de l'application** : `com.islamquizz.nibras` est provisoire. Il ne peut plus changer
  après la première publication. Pour le modifier : changez `appId` dans `capacitor.config.json`,
  supprimez `android/` et `ios/`, puis `npx cap add android && npx cap add ios && npm run icons`.
- **Icône** : remplacez `assets/logo.png` (1024 × 1024) puis lancez `npm run icons`.
- **Questions à relire** : environ 790 questions ont été rédigées sans vérification contre les sources ; les 580 autres (Coran) sont générées depuis le texte du Mushaf.
  Les références affichées (sourate et verset, recueil de hadith) servent à les contrôler.
- **Politique de confidentialité** : les deux stores en exigent une dès qu'il y a des comptes.
  L'application enregistre un pseudonyme, un mot de passe (haché) et des scores. Pas d'e-mail.

## Comptes, classement, groupes, duels

- **Compte** : pseudonyme unique (3 à 16 caractères) et mot de passe (8 caractères minimum).
  Le joueur retrouve ses points sur n'importe quel appareil. Il n'y a pas d'e-mail, donc pas de
  récupération de mot de passe oublié.
- **Classement** : tous les joueurs inscrits ayant terminé au moins une partie. Il se recharge
  toutes les 20 secondes.
- **Groupes** : un joueur crée un groupe et partage son code à 6 caractères ; chaque groupe a son
  propre classement. 20 groupes par joueur, 200 membres par groupe.
- **Duel par code** : un joueur crée un duel, joue 10 questions, puis envoie le code à son
  adversaire, qui joue les mêmes questions quand il veut. Le meilleur score gagne, puis le plus
  rapide. Chacun ne voit le score de l'autre qu'après avoir joué.

## Limites connues

- **Scores calculés sur le téléphone.** Le serveur borne les valeurs (10 au défi du jour et aux
  duels, 3 000 points de gain au plus par envoi) mais ne rejoue pas les parties.
- **Pas de limite de tentatives de connexion.** À ajouter avant une diffusion large, par exemple
  avec une règle de limitation de débit Cloudflare sur `/api/login` et `/api/register`.
- **Pseudonymes non filtrés.** Pour supprimer un compte :
  `npx wrangler d1 execute islamquizz --remote --command "DELETE FROM players WHERE pseudo = 'le-pseudo'"`
- **Même version pour un duel.** Les deux joueurs doivent avoir la même liste de questions,
  donc la même version de l'application.

## Modifier ou ajouter des questions

Elles sont dans `www/index.html`, dans le tableau `Q`. Une ligne par question :

```js
['q', 1, 'السؤال؟', ['الجواب الصحيح', 'خطأ', 'خطأ', 'خطأ'], 'المرجع'],
```

- Premier champ, le thème : `q` Coran, `h` Hadith, `s` Sîra, `p` Compagnons et personnalités,
  `f` Fiqh, `n` Histoires des prophètes, `t` Histoire et civilisation, `a` Croyance et bonnes manières.
- Deuxième champ, le niveau : 1 facile, 2 moyen, 3 difficile.
- La bonne réponse est toujours la première de la liste ; l'application mélange l'ordre à l'affichage.

## Tester le serveur sur votre ordinateur

```sh
cd server
npm run db:local
npm run dev            # puis ouvrir http://localhost:8787
```
