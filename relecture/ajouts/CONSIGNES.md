# Consignes pour la rédaction d'un lot de questions (étape 6)

Projet : `/Users/Simo/dev/islamquizz-app`, quiz islamique en arabe. Lis d'abord `CLAUDE.md`
(sections « Banque de questions » et « Règles de contenu »).

## Ce qu'on te demande

Écrire **50 nouvelles questions** pour UN thème (indiqué dans ta mission), réparties sur les
trois niveaux (environ 17 faciles, 17 moyennes, 16 difficiles ; si le thème manque nettement
d'un niveau, le compteur de `node scripts/check-questions.mjs` te le montre, penche un peu vers
ce niveau). Tu écris UNIQUEMENT le fichier `relecture/ajouts/<code>.csv`. Ne modifie aucun
autre fichier, en particulier pas `www/index.html`.

Mieux vaut 40 questions sûres que 50 dont certaines douteuses : **n'ajoute rien dont tu n'es
pas certain**. Si tu n'arrives pas à 50 avec des questions sûres, arrête-toi et dis combien.

## Règles de contenu (non négociables)

1. **Exactitude** : uniquement des faits établis et connus des savants, que tu peux rattacher
   à une source précise. Pas de légendes (isrâ'îliyyât), pas de récits faibles présentés comme
   sûrs, pas de chiffres incertains.
2. **Référence précise** pour chaque question :
   - Coran : « سورة البقرة، الآية 255 » (ou « الآيات 1-5 »). VÉRIFIE chaque référence coranique
     dans `node_modules/quran-json/dist/quran.json` (texte arabe) et `quran_fr.json` (traduction) :
     le verset cité doit vraiment dire ce que la question affirme. Exemple :
     `node -e 'const q=require("quran-json/dist/quran.json");console.log(q[1].verses[254].text)'`
   - Hadith : recueil + rapporteur (compagnon), comme dans l'existant : « رواه البخاري عن أبي هريرة »,
     « متفق عليه عن ... ». N'ajoute un numéro que si tu en es certain, et précise alors l'édition
     usuelle (numérotation de فتح الباري pour البخاري, de محمد فؤاد عبد الباقي pour مسلم).
     Uniquement des hadiths authentiques (البخاري، مسلم، ou jugés صحيح/حسن de façon reconnue).
   - Sîra, histoire, compagnons : ouvrage de référence (« سيرة ابن هشام »، « البداية والنهاية لابن كثير »،
     « الرحيق المختوم »، « الإصابة لابن حجر »، « سير أعلام النبلاء »...), et/ou la source primaire
     (verset, hadith du Sahih). Pas de référence inventée : si tu ne connais pas la source exacte,
     n'écris pas la question.
   - Fiqh : uniquement des points de consensus (إجماع) ou de texte explicite ; référence = texte
     (verset/hadith) ou « بالإجماع » + ouvrage (« الإجماع لابن المنذر »...). Évite tout point où les
     écoles divergent ; si une question touche une divergence, ne l'écris pas.
3. **Jamais de verset écrit de mémoire.** Si une question cite le texte d'un verset (même un
   fragment), copie-le EXACTEMENT depuis `quran.json` (sans normaliser l'Unicode) entre ﴿ ﴾.
   Les citations de hadith doivent être la formulation connue des recueils.
4. Évite les sujets de divergence entre écoles (y compris en croyance) ; sinon, ne l'écris pas.
5. **Pas de doublon** avec l'existant : lis les questions existantes de ton thème dans
   `www/index.html` (lignes commençant par `['<code>',`) et ne repose pas la même question,
   même formulée autrement. L'outil de validation détecte seulement les textes identiques ;
   les reformulations, c'est à toi de les éviter.
6. Toutes les réponses fausses doivent être plausibles mais **sans ambiguïté fausses**
   (aucune ne doit pouvoir être défendue comme juste). 4 options de préférence (2 à 4 permis).
7. Arabe soigné, avec les vocalisations utiles (comme l'existant), formules de respect
   (ﷺ، عليه السلام، رضي الله عنه) comme dans l'existant.
8. Pas d'apostrophe `'` ni de barre `\` nulle part ; pas de retour à la ligne dans une cellule.

## Format du fichier

CSV UTF-8, séparateur `;`, avec exactement cet en-tête (12 colonnes) :

```
réf. interne (ne pas modifier);n°;thème;niveau;question;bonne réponse;autre réponse 1;autre réponse 2;autre réponse 3;référence;vérifié;remarque
```

- `réf. interne`, `n°`, `vérifié` : vides.
- `thème` : le code (q, h, s, p, f, n, t, a) ; `niveau` : 1, 2 ou 3.
- `remarque` : vide si tu es certain ; sinon une courte note en français expliquant ce qu'un
  relecteur doit contrôler (« numéro du hadith à confirmer », « date à confirmer »...).
- Mets entre guillemets doubles toute cellule contenant `;` ou `"` (doubler les `"` internes).

Écris le fichier avec un petit script Node (JSON → CSV) plutôt qu'à la main, pour éviter les
erreurs de guillemets.

## Validation obligatoire avant de rendre

```
node scripts/import-questions.mjs relecture/ajouts/<code>.csv --essai
```

Doit afficher « 0 modifiée(s), N ajoutée(s), 0 supprimée(s) » sans erreur (ce mode n'écrit rien).
Corrige jusqu'à ce que ce soit le cas.

## Ton compte rendu final (en français, court)

1. Nombre de questions par niveau.
2. **À vérifier en priorité** : la liste des questions (texte arabe + raison) dont l'exactitude
   ou la référence mérite un contrôle humain en premier (numéros de hadith, dates, chiffres,
   attributions). Sois honnête : tout ce qui vient de ta mémoire sans vérification possible
   dans un fichier du projet doit y figurer s'il y a le moindre doute.
3. Les références coraniques que tu as vérifiées dans quran-json (combien).
