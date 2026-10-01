// ==========================================================
// Logique du bandeau / menu déroulant du portail — partagée entre tous les
// widgets internes.
//
// À charger avec un <script src="…/portail-menu.js"> STATIQUE dans le <head>
// (pas dans <helmet> : le runtime y injecte les scripts en asynchrone, donc
// sans garantie d'ordre), AVANT ./support.js et donc avant le script du
// widget, qui utilise les globales définies ici.
//
// Les styles du bandeau (classes pm-*) sont dans aucarre-ui.css, sections
// BANDEAU / MENU DU PORTAIL / UTILISATEUR.
//
// L'identification de la personne connectée ("moi") reste propre à chaque
// widget — ce fichier ne fait que mettre en forme ce qu'on lui donne, il ne
// décide jamais de qui est connecté.
//
// GABARIT HTML COMMUN du bandeau (à recopier dans chaque widget ; seuls le
// sous-titre et les blocs optionnels — nav, utilisateur — changent) :
//
//   <header class="pm-header">
//     <div class="pm-header-inner">
//       <div class="pm-brand">
//         <span class="pm-brand-menu-wrap">
//           <button type="button" class="pm-brand-logo-btn" onClick="{{ onTogglePortail }}"
//                   aria-label="Autres outils internes" aria-expanded="{{ portailOuvertAttr }}">
//             <img class="pm-brand-logo" src="{{ portailLogoUrl }}" alt="au carré" />
//             <span class="pm-chevron" aria-hidden="true">{{ portailChevron }}</span>
//           </button>
//           <sc-if value="{{ portailOuvert }}" hint-placeholder-val="{{ false }}">
//             <div class="pm-portail-menu">
//               <sc-if value="{{ portailChargement }}" hint-placeholder-val="{{ false }}">
//                 <p class="pm-portail-vide">Chargement…</p>
//               </sc-if>
//               <sc-if value="{{ portailErreur }}" hint-placeholder-val="{{ false }}">
//                 <p class="pm-portail-vide">Liste indisponible.</p>
//               </sc-if>
//               <sc-for list="{{ portailOutils }}" as="o" hint-placeholder-count="3">
//                 <a href="{{ o.url }}" target="_blank" rel="noopener">{{ o.nom }}</a>
//               </sc-for>
//             </div>
//           </sc-if>
//         </span>
//         <span class="pm-brand-sep"></span>
//         <span class="pm-brand-sub">Nom du widget</span>
//       </div>
//       <!-- optionnel : <nav>…</nav> propre au widget -->
//       <!-- optionnel : <div class="pm-user"><span class="pm-user-name">{{ moiLabel }}</span>
//                          <span class="pm-avatar" aria-hidden="true">{{ moiInitiales }}</span></div> -->
//     </div>
//   </header>
// ==========================================================

// Liste des outils internes, partagée avec le widget "Portail des outils".
const URL_PORTAIL = "https://nicolasschena-aucarre.github.io/Logo_Aucarre/portail.json";
// Logo du bandeau (aussi utilisé pour le PDF du widget Renouvellement).
const URL_LOGO = "https://nicolasschena-aucarre.github.io/Logo_Aucarre/logo.png";

// À étaler dans le "state" de chaque widget :
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
  if (etatActuel.portailChargement) return; // un chargement est déjà en cours (ouvertures/fermetures rapides)
  if (etatActuel.portailOutils.length > 0 || etatActuel.portailErreur) return; // déjà chargé (ou déjà tenté)
  appliquerEtat({ portailChargement: true, portailErreur: false });
  try {
    const res = await fetch(URL_PORTAIL);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const outils = await res.json();
    if (!Array.isArray(outils)) throw new Error("Format inattendu");
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
    portailLogoUrl: URL_LOGO,
    onTogglePortail: onTogglePortailFn
  };
}

// Bloc "utilisateur" du bandeau (nom + initiales dans l'avatar). Le widget
// décide qui est "moi" et passe { prenom, nom } — ou null si personne n'a pu
// être identifié :
//   ...calculerIdentiteRenderVals(s.moi && { prenom: s.moi.Prenom, nom: s.moi.Nom })
function calculerIdentiteRenderVals(moi) {
  const prenom = (moi && moi.prenom) || "";
  const nom = (moi && moi.nom) || "";
  return {
    moiLabel: moi ? prenom + " " + nom : "Non identifié·e",
    moiInitiales: moi ? (prenom.charAt(0) + nom.charAt(0)).toUpperCase() : "?",
    noIdentity: !moi
  };
}
