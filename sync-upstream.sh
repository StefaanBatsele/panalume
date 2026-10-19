#!/bin/sh
# Haalt de laatste versie van leacho73/panalume binnen in deze fork en pusht
# ze naar GitHub. Daarna in HA: Add-on store → ⋮ → Op updates controleren, en
# bij Panalume (fork) op Bijwerken (nieuwe versie) of Opnieuw bouwen klikken.
set -e
cd "$(dirname "$0")"
git switch main
git fetch upstream
git merge --no-edit upstream/main
git push origin main
grep '^version' panalume/config.yaml
