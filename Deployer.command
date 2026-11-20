#!/bin/bash
# IslamQuizz — mise en ligne gratuite sur Cloudflare (application web + serveur).
# Double-cliquez sur ce fichier (Mac), ou lancez dans un terminal :  bash Deployer.command

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.volta/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
export WRANGLER_SEND_METRICS=false

RACINE="$(cd "$(dirname "$0")" && pwd)"
fin() { echo; read -n1 -r -p "Appuyez sur une touche pour fermer cette fenêtre."; echo; exit "${1:-0}"; }

echo "=== IslamQuizz : mise en ligne sur Cloudflare (gratuit) ==="
echo

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js n'est pas installé sur cet ordinateur."
  echo "Installez la version « LTS » depuis la page qui va s'ouvrir, puis relancez ce fichier."
  command -v open >/dev/null 2>&1 && open "https://nodejs.org/fr/download"
  fin 1
fi
MAJEUR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$MAJEUR" -lt 20 ]; then
  echo "Node.js $(node -v) est trop ancien : il faut la version 20 ou plus récente."
  command -v open >/dev/null 2>&1 && open "https://nodejs.org/fr/download"
  fin 1
fi

cd "$RACINE/server" || { echo "Dossier server/ introuvable à côté de ce fichier."; fin 1; }

echo "1/3  Installation de l'outil de déploiement (une minute environ)…"
npm install --no-audit --no-fund || { echo "L'installation a échoué. Vérifiez la connexion Internet."; fin 1; }

echo
echo "2/3  Connexion à Cloudflare : une page s'ouvre dans le navigateur, cliquez sur « Allow »."
npx wrangler login || { echo "La connexion à Cloudflare a échoué."; fin 1; }

echo
echo "3/3  Mise en ligne…"
echo "     (Si Cloudflare propose de créer un sous-domaine workers.dev, répondez oui et choisissez un nom.)"
npx wrangler deploy 2>&1 | tee "$RACINE/deploiement.log"

URL="$(grep -Eo 'https://[A-Za-z0-9.-]+\.workers\.dev' "$RACINE/deploiement.log" | head -1)"
echo
if [ -n "$URL" ]; then
  echo "$URL" > "$RACINE/adresse.txt"
  echo "=============================================================="
  echo "  Application en ligne : $URL"
  echo "=============================================================="
  echo "Ouvrez cette adresse sur le téléphone, puis « Ajouter à l'écran d'accueil »."
  echo "L'adresse est aussi enregistrée dans le fichier adresse.txt."
  command -v open >/dev/null 2>&1 && open "$URL"
  fin 0
else
  echo "La mise en ligne n'a pas abouti. Le détail est dans le fichier deploiement.log :"
  echo "copiez son contenu à Claude pour obtenir de l'aide."
  fin 1
fi
