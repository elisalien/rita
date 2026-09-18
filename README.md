# Rita ♥

Petit carnet Android pour suivre sa Ritaline au quotidien, en pixel art pastel façon vieux Harvest Moon.

<p>
  <img src="docs/app.png" width="260" alt="Écran Aujourd'hui">
  &nbsp;
  <img src="docs/widget.png" width="420" alt="Widget écran d'accueil">
</p>

## Ce que ça fait

- **5 étapes par jour** : réveil, prise, pic, chute, zéro effet. Un tap note l'heure, un autre la corrige.
- **Widget** pour l'écran d'accueil : un tap sur une case vide enregistre l'heure sans ouvrir l'app.
- **Journal** : moyennes sur 14 jours (montée, plateau, descente, durée totale), frise par jour, dose et note.
- **Prévisions** : pic, chute et fin d'effet estimés d'après tes moyennes.
- **Privé** : aucune connexion internet, aucune sauvegarde cloud. Export / import JSON pour garder une copie.

## Installer

Télécharge `Rita-x.y.z.apk` dans les [Releases](../../releases), ouvre-le sur le téléphone et autorise l'installation.
Android 8.0 minimum.

## Compiler

```bash
python tools/make_assets.py      # police pixel, sprites, icône
python tools/widget_preview.py   # aperçu du widget
./gradlew assembleRelease
```

L'interface est en HTML/CSS/JS dans `app/src/main/assets/www/` (prévisualisable dans un navigateur).
Le widget est dessiné en Java dans `WidgetRenderer.java`. Police et sprites sont faits maison.

---

Rita est un outil de suivi personnel, pas un dispositif médical. Les questions sur le traitement se posent à ton médecin.
