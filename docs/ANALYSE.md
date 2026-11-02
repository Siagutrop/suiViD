# Analyse du classeur « Suivi Raphael.xlsx »

Copie analysée du Google Sheets de production. Ce document fait le
plan de correspondance entre les onglets existants et le modèle
de données de l'application.

## Inventaire

| Onglet | Plage | Contenu | Mode applicatif |
|---|---|---|---|
| `Suivi` | A1:K182 | Journal quotidien (dates pré-remplies) | lecture + écriture contrôlée C..K |
| `Liste` | A1:C95 | 92 exercices : Nom / Muscle / Lien vidéo | lecture seule |
| `Full body` | A1:J789 (2 blocs utilisés, ~29 lignes) | Modèle de programme ×2 | lecture seule (modèle d'import) |
| `Bilan` | A49:Z58 | Vide (mise en forme uniquement) | non utilisé |

## Onglet « Suivi » — le journal

| Col | Champ app | Type | Notes |
|---|---|---|---|
| A `Date` | `date` | date `dd/mm/yyyy` | **jamais écrite** — clé de correspondance |
| B `N°Semaine` | `week` | entier | **jamais écrite** |
| C `Sommeil en heure` | `sommeil` | décimal (accepte `7,5`) | |
| D `Forme du jour (1 à 10)` | `forme` | entier 1–10 | |
| E `Poids en kg` | `poids` | décimal | |
| F `Total calorie (kcal)` | `calories` | nombre | |
| G `Glucides` | `glucides` | nombre (g) | |
| H `Protéines` | `proteines` | nombre (g) | |
| I `Lipides` | `lipides` | nombre (g) | |
| J `Pas` | `pas` | entier | |
| K `Entraînement` | `entrainement` | texte | renseigné auto à la fin d'une séance |

- Lignes 2–33 pré-remplies (01/11/2026 → 02/12/2026). La ligne du jour
  est retrouvée par correspondance exacte de la date (fuseau
  `Europe/Paris`).
- `-` est la convention « pas de donnée » → lu comme `null` ; effacer
  une valeur ré-écrit `-`. Une valeur absente n'est jamais `0`.
- Si aucune ligne n'existe pour le jour courant : l'API renvoie
  `rowMissing` et **ne crée jamais** la ligne automatiquement.

## Onglet « Liste » — bibliothèque

- 92 exercices : `Nom`, `Muscle`, `Lien vidéo` (YouTube Shorts).
- Quelques liens absents → affichage « pas de vidéo ».
- **Anomalie source** : un exercice a le muscle `Trices` (faute de
  frappe). L'app normalise en `Triceps` à la lecture uniquement — le
  classeur n'est pas modifié.
- Groupes : Abdos, Adducteur, Biceps, Dos, Epaules, Fessiers, Ischios,
  Lombaires, Mollets, Pectoraux, Quadriceps, Triceps.

## Onglet « Full body » — modèle de programme

Deux blocs identiques (r.1–14 et r.16–29). Structure d'un bloc :

```
Full body                                        (titre, fusionné A:J)
💪 | Exercice | | | Série 1 | | Série 2 | | Série 3
   | Nom de l'exercice | Vidéo | Réglage | Charge | Rép. | Charge | Rép. | Charge | Rép.
   | Développé Couché Smith Machine | 🎬 | Variante… | X | X | X | X | X | X
```

- 11 exercices par bloc. Un `X` dans une colonne « Charge » = série
  prévue → `series` = nombre de X (ex. 3 : 3 séries, autres : 2).
- `Réglage` → `variante` (consignes / alternative).
- `🎬` = emoji sans lien ; la vidéo est retrouvée par nom dans `Liste`.
- Cet onglet n'est **jamais modifié**. Au provisionnement, le premier
  bloc est importé dans `ProgrammeExercices` (onglet normalisé).

## Nouveaux onglets (provisionnement explicite uniquement)

| Onglet | Colonnes | Usage |
|---|---|---|
| `Programmes` | id · nom · statut · cree_le · note | un programme par ligne |
| `ProgrammeExercices` | programme_id · ordre · exercice · series · repetitions_cible · variante · notes | composition des programmes |
| `Seances` | id · date · programme_id · programme_nom · debut · fin · duree_sec · statut · notes | historique (append-only) |
| `SeanceSeries` | seance_id · exercice · ordre_exercice · serie · charge_kg · repetitions · terminee · notes | séries des séances |
| `Parametres` | cle · valeur | objectifs & préférences |

Créés via `POST /api/admin/provision` (script `npm run api:setup-sheets`)
— jamais automatiquement pendant le fonctionnement.

## Correspondance nomenclature

| Fichier | Application |
|---|---|
| « Réglage » | variante / consigne |
| « Charge (kg) » + « Rép. réalisées » | séries `chargeKg` × `repetitions` |
| « Entraînement » | nom du programme de la séance du jour |
