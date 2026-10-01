# Intégrer le bandeau « menu du portail » dans un widget

Le bandeau affiche le logo au carré, un menu déroulant listant les outils internes (lu depuis `portail.json`), le nom du widget et, en option, la personne connectée.

Ce guide s'applique aux widgets au format `<x-dc>` (runtime `support.js`, classe `Component`, gabarit avec `{{ variables }}`). Compter 10 à 15 minutes.

## Fichiers partagés utilisés

| Fichier | Rôle |
|---|---|
| `aucarre-ui.css` | Palette, base, composants, **et styles du bandeau** (classes `pm-*`) |
| `portail-menu.js` | Logique du menu : ouverture, chargement unique de la liste, variables du gabarit |
| `aucarre-grist.js` | Classe de base `creerBaseWidget`, statut chargement/erreur/prêt, `trouverMoi` |

Les trois sont hébergés dans le même dossier GitHub Pages que `logo.png` et `portail.json`. **Rien n'est à publier de nouveau** pour ajouter le bandeau à un widget de plus.

## Étape 1 : charger les fichiers dans le `<head>`

Avant `./support.js`, dans cet ordre :

```html
<script src="https://docs.getgrist.com/grist-plugin-api.js"></script>
<link rel="stylesheet" href="https://nicolasschena-aucarre.github.io/Logo_Aucarre/aucarre-ui.css">
<script src="https://nicolasschena-aucarre.github.io/Logo_Aucarre/aucarre-grist.js"></script>
<script src="https://nicolasschena-aucarre.github.io/Logo_Aucarre/portail-menu.js"></script>
<script src="./support.js"></script>
```

> **Ne pas** mettre ces balises dans le `<helmet>` : le runtime y injecte les scripts de façon asynchrone, donc après l'évaluation du script du widget, ce qui provoque des erreurs `... is not defined`.

## Étape 2 : brancher la logique dans la classe `Component`

```js
class Component extends creerBaseWidget(DCLogic) {
  state = {
    ...ETAT_INITIAL_PORTAIL,   // portailOuvert, portailOutils, portailChargement, portailErreur
    ...ETAT_INITIAL_BASE,      // status: "loading", errorMessage: ""
    /* le reste de l'état, propre au widget */
  };

  async chargerDonnees() {
    /* … charger les tables, puis : this.setState({ status: "ready", ... }) */
  }

  async togglePortail() {
    await togglePortailLogique(this.state, patch => this.setState(patch));
  }

  renderVals() {
    const s = this.state;
    const statut = calculerStatutRenderVals(s);
    if (!statut.isReady) return statut;
    return {
      ...statut,
      ...calculerPortailRenderVals(s, () => this.togglePortail()),
      /* le reste, propre au widget */
    };
  }
}
```

Points d'attention :

- `togglePortail()` doit être définie **dans le widget** : elle fournit son état et son `setState` à la logique commune.
- `creerBaseWidget` appelle `grist.ready()` puis `chargerDonnees()`. Pour lancer autre chose au démarrage, définir `demarrer()` dans le widget.
- Sans la classe de base (`extends DCLogic` classique), le menu fonctionne quand même ; il faut alors gérer soi-même `grist.ready()` et le statut.

## Étape 3 : ajouter le bandeau dans le gabarit

À placer en haut du gabarit, une fois les données chargées. Seuls le sous-titre `pm-brand-sub` et les blocs optionnels changent d'un widget à l'autre.

```html
<header class="pm-header">
  <div class="pm-header-inner">
    <div class="pm-brand">
      <span class="pm-brand-menu-wrap">
        <button type="button" class="pm-brand-logo-btn" onClick="{{ onTogglePortail }}"
                aria-label="Autres outils internes" aria-expanded="{{ portailOuvertAttr }}">
          <img class="pm-brand-logo" src="{{ portailLogoUrl }}" alt="au carré" />
          <span class="pm-chevron" aria-hidden="true">{{ portailChevron }}</span>
        </button>
        <sc-if value="{{ portailOuvert }}" hint-placeholder-val="{{ false }}">
          <div class="pm-portail-menu">
            <sc-if value="{{ portailChargement }}" hint-placeholder-val="{{ false }}">
              <p class="pm-portail-vide">Chargement…</p>
            </sc-if>
            <sc-if value="{{ portailErreur }}" hint-placeholder-val="{{ false }}">
              <p class="pm-portail-vide">Liste indisponible.</p>
            </sc-if>
            <sc-for list="{{ portailOutils }}" as="o" hint-placeholder-count="3">
              <a href="{{ o.url }}" target="_blank" rel="noopener">{{ o.nom }}</a>
            </sc-for>
          </div>
        </sc-if>
      </span>
      <span class="pm-brand-sep"></span>
      <span class="pm-brand-sub">Nom du widget</span>
    </div>

    <!-- Optionnel : navigation propre au widget -->
    <!-- <nav> … </nav> -->

    <!-- Optionnel : personne connectée (voir étape 4) -->
    <!-- <div class="pm-user">
           <span class="pm-user-name">{{ moiLabel }}</span>
           <span class="pm-avatar" aria-hidden="true">{{ moiInitiales }}</span>
         </div> -->
  </div>
</header>
```

## Étape 4 (optionnelle) : afficher la personne connectée

Le fichier partagé ne décide **jamais** de qui est connecté : c'est le widget qui le détermine, puis qui passe le prénom et le nom.

1. Dans `chargerDonnees()`, trouver la ligne de la personne connectée. La seule ligne dont l'email n'est pas masqué par l'ACL est la sienne :

   ```js
   const moi = trouverMoi(lignes, "Email");   // null si personne n'est identifiable
   ```

2. Dans `renderVals()`, ajouter :

   ```js
   ...calculerIdentiteRenderVals(moi && { prenom: moi.Prenom, nom: moi.Nom }),
   ```

   Cela fournit `moiLabel`, `moiInitiales` et `noIdentity` (pour afficher un message si personne n'est identifié).

3. Décommenter le bloc `pm-user` dans le gabarit.

Prérequis côté Grist : une table avec les colonnes Prénom, Nom et Email, et une règle d'accès (ACL) qui masque les emails des autres lignes.

## Étape 5 : vérifier

- [ ] Le bandeau s'affiche (logo, chevron, sous-titre).
- [ ] Un clic sur le logo ouvre le menu et liste les outils ; un deuxième clic le ferme.
- [ ] Console du navigateur (F12), onglet Réseau : `portail.json` n'apparaît qu'**une seule fois**, même après plusieurs ouvertures.
- [ ] Tab au clavier : le bouton du logo prend le focus avec un anneau noir visible, et `aria-expanded` passe de `false` à `true`.
- [ ] Si le bloc utilisateur est en place : prénom et initiales corrects ; avec une personne non identifiable, le widget n'affiche pas `undefined`.
- [ ] Aucune règle CSS du widget ne redéfinit la palette (`:root`), `html`/`body` ou `box-sizing` : tout cela vient d'`aucarre-ui.css`.

## Dépannage

| Symptôme | Cause probable | Que faire |
|---|---|---|
| `creerBaseWidget is not defined` (ou `togglePortailLogique…`) | Fichier partagé pas encore servi (cache GitHub Pages ou Grist) ou balises dans le `<helmet>` | Vérifier l'URL du fichier dans le navigateur, recharger avec Ctrl+F5, attendre un à deux minutes après une publication, vérifier que les balises sont dans le `<head>` |
| Menu vide, « Liste indisponible. » | `portail.json` introuvable (404), format invalide, ou blocage réseau | Ouvrir l'URL de `portail.json` ; il doit contenir un tableau `[{ "nom": "…", "url": "…" }]` |
| Bandeau sans style | `aucarre-ui.css` non chargé ou chargé après le `<style>` du widget | Vérifier le `<link>` dans le `<head>` et son statut dans l'onglet Réseau |
| Logo absent | `logo.png` introuvable | Vérifier `URL_LOGO` dans `portail-menu.js` |
| Menu qui ne se rouvre pas après une erreur | La liste n'est pas re-tentée après un échec (volontaire) | Recharger le widget |

## Noms réservés

Ces noms sont définis globalement par les fichiers partagés ; ne pas les redéclarer dans un widget :

- **`portail-menu.js`** : `URL_PORTAIL`, `URL_LOGO`, `ETAT_INITIAL_PORTAIL`, `togglePortailLogique`, `calculerPortailRenderVals`, `calculerIdentiteRenderVals`.
- **`aucarre-grist.js`** : `reessayer`, `chargerTables`, `tableVersLignes`, `normaliserListe`, `normaliserRef`, `estValeurAutorisee`, `chargerChoixColonnes`, `decodeJwtDocId`, `buildApiBase`, `uploaderPieceJointe`, `ajouterJours`, `memeJourCalendaire`, `messageErreur`, `trouverMoi`, `ETAT_INITIAL_BASE`, `calculerStatutRenderVals`, `creerBaseWidget`.

## Modifier le menu lui-même

- **Ajouter ou retirer un outil** : modifier `portail.json`. Aucun widget n'est à toucher.
- **Changer l'apparence du bandeau** : sections `BANDEAU`, `MENU DU PORTAIL` et `UTILISATEUR` d'`aucarre-ui.css`. Le changement s'applique à tous les widgets.
- **Changer le comportement** : `portail-menu.js`. Attention, une modification touche tous les widgets en même temps : tester sur au moins deux d'entre eux avant de publier.
