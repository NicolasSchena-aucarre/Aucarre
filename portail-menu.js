// ==========================================================
// Logique du menu déroulant du portail — partagée entre tous les widgets
// internes. Chargé via <script src="…/portail-menu.js"> AVANT le script
// propre à chaque widget (il utilise les globales définies ici).
//
// L'identification de la personne connectée ("moi") reste propre à chaque
// widget — ce fichier ne s'occupe que du bandeau/menu, jamais de qui est
// connecté.
// ==========================================================

// Liste des outils internes, partagée avec le widget "Portail des outils".
const URL_PORTAIL = "https://nicolasschena-aucarre.github.io/Logo_Aucarre/portail.json";

// À copier tel quel dans le "state" de chaque widget :
//   state = { ...ETAT_INITIAL_PORTAIL, moi: null, ... /* le reste, propre au widget */ };
const ETAT_INITIAL_PORTAIL = {
  portailOuvert: false,
  portailOutils: [],
  portailChargement: false,
  portailErreur: false
};

// Chaque widget appelle ça depuis SA PROPRE méthode togglePortail(), qui
// lui fournit son état actuel et sa propre fonction setState :
//   async togglePortail() {
//     await togglePortailLogique(this.state, patch => this.setState(patch));
//   }
// Charge la liste une seule fois, à la première ouverture — pas à chaque
// clic, pour ne pas re-solliciter le fichier distant inutilement.
async function togglePortailLogique(etatActuel, appliquerEtat) {
  const ouverture = !etatActuel.portailOuvert;
  appliquerEtat({ portailOuvert: ouverture });
  if (!ouverture) return; // vient de se fermer, rien à charger
  if (etatActuel.portailOutils.length > 0 || etatActuel.portailErreur) return; // déjà chargé (ou déjà tenté)
  appliquerEtat({ portailChargement: true, portailErreur: false });
  try {
    const res = await fetch(URL_PORTAIL);
    const outils = await res.json();
    appliquerEtat({ portailOutils: outils, portailChargement: false });
  } catch (e) {
    appliquerEtat({ portailChargement: false, portailErreur: true });
  }
}

// Chaque widget étale le résultat dans son propre renderVals(), à côté de
// ses propres valeurs :
//   return {
//     ...calculerPortailRenderVals(s, () => this.togglePortail()),
//     /* le reste, propre au widget */
//   };
function calculerPortailRenderVals(etat, onTogglePortailFn) {
  return {
    portailOuvert: etat.portailOuvert,
    portailOuvertAttr: etat.portailOuvert ? "true" : "false",
    portailChevron: etat.portailOuvert ? "▴" : "▾",
    portailChargement: etat.portailChargement,
    portailErreur: etat.portailErreur,
    portailOutils: etat.portailOutils,
    onTogglePortail: onTogglePortailFn
  };
}
