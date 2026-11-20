# IslamQuizz (نِبراس)

Quiz islamique en arabe pour Android, iOS et web. Interface entièrement en arabe (RTL).
La propriétaire du projet travaille en français : réponds-lui en français.

## Structure

| Chemin | Rôle |
|---|---|
| `www/index.html` | Toute l'application : styles, banque de questions (`Q`), logique, écrans. Fichier source, sans étape de build. |
| `www/config.js` | `window.IQ_API` : adresse du serveur. Vide = même origine (version web servie par le Worker). |
| `www/fonts/` | Police Amiri embarquée. Le texte coranique (rasm othmani) en dépend. |
| `server/src/worker.js` | API Cloudflare Workers : comptes, classement, groupes, duels par code. Sert aussi `www/`. |
| `server/schema.sql` | Tables D1 : `players`, `sessions`, `groups`, `group_members`, `duels`. |
| `server/wrangler.jsonc` | Config de déploiement, reliée à la base D1 `islamquizz`. |
| `android/`, `ios/` | Projets natifs générés par Capacitor 8. Ne pas éditer `*/public/` à la main. |
| `data/ayat.json` | 70 versets pour « آية اليوم » : `[sourate, verset, explication]`. Après modification : `node scripts/build-ayat.mjs` (recopie le texte exact depuis `quran-json` dans le tableau `AYAT` de `index.html`). |
| `scripts/export-questions.mjs`, `import-questions.mjs` | Relecture : export des questions rédigées (pas les générées) vers `relecture/questions-redigees.csv`, puis réimport du CSV corrigé dans `Q` (`--essai` pour voir sans écrire). Suivi de la colonne « vérifié » dans `data/verifications.json`. |
| `scripts/check-questions.mjs` | Vérifie la banque `Q` (format, thèmes, niveaux, doublons, apostrophes) et compte les questions. À lancer après toute modification de `Q`. |
| `Deployer.command` | Script de mise en ligne (npm install, wrangler login, wrangler deploy). |

## Commandes

```sh
cd server && npm install && npx wrangler deploy     # mettre en ligne (web + API)
cd server && npm run db:local && npm run dev        # tester en local sur http://localhost:8787
npm install && npx cap sync                         # recopier www/ dans android/ et ios/
npx cap open android        # ou : npx cap open ios
```

Après toute modification de `www/` : `npx cap sync`, puis redéployer le serveur.

## Banque de questions

Dans `www/index.html`, tableau `Q`, une ligne par question :

```js
['q', 1, 'السؤال؟', ['الجواب الصحيح', 'خطأ', 'خطأ', 'خطأ'], 'المرجع'],
```

- Thème : `q` Coran, `h` Hadith, `s` Sîra, `p` Compagnons et personnalités, `f` Fiqh,
  `n` Histoires des prophètes, `t` Histoire et civilisation, `a` Croyance et bonnes manières.
- Niveau : 1 facile, 2 moyen, 3 difficile.
- La bonne réponse est TOUJOURS la première ; l'application mélange à l'affichage. 2 à 4 options.
- Pas d'apostrophe `'` dans les textes (chaînes entre apostrophes).
- Le texte de chaque question doit être unique.
- La liste des thèmes existe aussi côté serveur (`THEMES` dans `worker.js`) : garder les deux alignées.

État : 1 373 questions. Environ 580 questions de Coran sont générées depuis le texte du Mushaf
(paquet npm `quran-json`, source quranenc.com). Les 790 autres ont été rédigées de mémoire par
une IA, sans vérification contre les sources : elles restent à relire. Les questions générées sont
toutes après le commentaire « أسئلة القرآن المولَّدة من نصّ المصحف » dans `Q` : ajouter les nouvelles
questions rédigées AVANT ce repère.

## Règles de contenu (importantes)

- Ne jamais écrire un verset de mémoire : le prendre dans `quran-json` (`dist/quran.json`) par
  numéro de sourate et de verset, tel quel (pas de normalisation Unicode).
- Ne pas inventer de hadith ni de référence. Une question sans source sûre ne s'ajoute pas.
- Éviter les points de divergence entre écoles ; sinon le dire dans la référence.
- Toujours signaler à la propriétaire ce qui n'a pas été vérifié.

## Architecture de l'application

- État global `S` (écran, partie en cours `S.g`), profil joueur `P` (points, missions, stats),
  rendu par `render()` qui appelle la vue de `VIEWS[S.screen]`. Clics délégués via `data-act`.
- Modes : `classic`, `survival`, `sprint`, `tf`, `duel` (local), `rduel` (par code), `daily`.
- Points : 10, 20 ou 30 par bonne réponse selon le niveau (moitié en vrai/faux). Ligues par
  paliers de points (`LG`). Missions hebdomadaires (`MISSIONS`).
- Couche serveur : bloc « الخادم » (`call`, `signUp`, `signIn`, `push`, `fetchBoard`).
  `ONLINE` vaut `true` dans cette version.
- Les scores sont calculés côté client ; le serveur borne seulement les valeurs.

## Demandes en attente

- Réorganisation en 4 menus (Coran, Sunna d'al-Bukhârî et Muslim, Compagnons, Batailles et
  conquêtes) avec un classement par menu et par niveau : étudiée puis suspendue par la propriétaire.
- Limitation des tentatives sur `/api/login` et `/api/register`.
- Identifiant d'application définitif (`com.islamquizz.nibras` est provisoire).
