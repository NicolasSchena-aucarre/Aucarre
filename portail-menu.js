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
    // L'icône est dessinée en CSS (aucarre-ui.css, .pm-chevron selon aria-expanded) ;
    // chaîne vide gardée pour ne pas casser les gabarits qui affichent encore {{ portailChevron }}.
    portailChevron: "",
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

/* ---------- Widgets en JavaScript "classique" (sans le runtime <x-dc>) ---------- */

// Les widgets <x-dc> écrivent le gabarit du bandeau dans leur HTML (voir plus
// haut). Un widget "classique" (un objet state + une fonction render() qui
// reconstruit du HTML en chaîne) n'a pas de gabarit : cette fonction produit
// le bandeau, l'insère dans `conteneur` et gère son ouverture/fermeture.
//
//   <div id="portail-root"></div>      <!-- AVANT le contenu du widget, pas dedans -->
//
//   const bandeau = montrerBandeauPortail({
//     conteneur: document.getElementById("portail-root"),
//     etat: state,                      // l'objet state du widget (complété au besoin)
//     sousTitre: "Nom du widget",
//     getMoi: () => state.moi           // { prenom, nom } ou null — omettre pour ne pas afficher l'utilisateur
//   });
//   // plus tard, quand "moi" est connu :  bandeau.rafraichir();
//
// Le conteneur est distinct de la zone que render() reconstruit : le bandeau
// n'est donc jamais détruit par un re-rendu du widget. La liste n'est chargée
// qu'à la première ouverture ; le menu se ferme à Échap et au clic ailleurs.
function echapperHtmlPortail(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function montrerBandeauPortail({ conteneur, etat, sousTitre, getMoi }) {
  // Complète l'état du widget avec les champs du menu s'ils manquent.
  for (const k of Object.keys(ETAT_INITIAL_PORTAIL)) {
    if (etat[k] === undefined) etat[k] = ETAT_INITIAL_PORTAIL[k];
  }

  function bandeauHTML() {
    const p = calculerPortailRenderVals(etat, null);
    // Seuls les liens http(s) deviennent cliquables : une entrée "javascript:…"
    // dans portail.json ne doit jamais pouvoir s'exécuter dans le widget.
    const outils = (p.portailOutils || []).filter(o => o && /^https?:\/\//i.test(o.url));
    const utilisateur = getMoi ? calculerIdentiteRenderVals(getMoi()) : null;
    return `
<header class="pm-header">
  <div class="pm-header-inner">
    <div class="pm-brand">
      <span class="pm-brand-menu-wrap">
        <button type="button" class="pm-brand-logo-btn" id="pm-btn-portail" aria-label="Autres outils internes" aria-expanded="${p.portailOuvertAttr}">
          <img class="pm-brand-logo" src="${echapperHtmlPortail(p.portailLogoUrl)}" alt="au carré" />
          <span class="pm-chevron" aria-hidden="true">${p.portailChevron}</span>
        </button>
        ${p.portailOuvert ? `
        <div class="pm-portail-menu">
          ${p.portailChargement ? `<p class="pm-portail-vide">Chargement…</p>` : ""}
          ${p.portailErreur ? `<p class="pm-portail-vide">Liste indisponible.</p>` : ""}
          ${outils.map(o => `<a href="${echapperHtmlPortail(o.url)}" target="_blank" rel="noopener">${echapperHtmlPortail(o.nom)}</a>`).join("")}
        </div>` : ""}
      </span>
      <span class="pm-brand-sep"></span>
      <span class="pm-brand-sub">${echapperHtmlPortail(sousTitre)}</span>
    </div>
    ${utilisateur ? `
    <div class="pm-user">
      <span class="pm-user-name">${echapperHtmlPortail(utilisateur.moiLabel)}</span>
      <span class="pm-avatar" aria-hidden="true">${echapperHtmlPortail(utilisateur.moiInitiales)}</span>
    </div>` : ""}
  </div>
</header>`;
  }

  function rafraichir() {
    // Un re-rendu détruit le bouton : sans ce filet, quelqu'un qui navigue au
    // clavier perdrait le focus à chaque ouverture/fermeture.
    const avaitFocus = document.activeElement && document.activeElement.id === "pm-btn-portail";
    conteneur.innerHTML = bandeauHTML();
    const bouton = document.getElementById("pm-btn-portail");
    if (bouton) {
      bouton.addEventListener("click", basculer);
      if (avaitFocus) bouton.focus();
    }
  }

  async function basculer() {
    await togglePortailLogique(etat, patch => { Object.assign(etat, patch); rafraichir(); });
  }

  function fermer() {
    if (!etat.portailOuvert) return;
    etat.portailOuvert = false;
    rafraichir();
  }

  // closest() plutôt que conteneur.contains() : au moment où ce gestionnaire
  // s'exécute, le bouton cliqué a déjà été remplacé par rafraichir() (donc
  // détaché du document), mais il garde son ancêtre .pm-brand-menu-wrap.
  document.addEventListener("click", e => {
    if (etat.portailOuvert && !(e.target.closest && e.target.closest(".pm-brand-menu-wrap"))) fermer();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && etat.portailOuvert) {
      fermer();
      const bouton = document.getElementById("pm-btn-portail");
      if (bouton) bouton.focus();
    }
  });

  rafraichir();
  return { rafraichir };
}
