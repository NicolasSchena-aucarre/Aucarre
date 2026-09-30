// ==========================================================
// aucarre-grist.js — utilitaires Grist partagés entre tous les widgets
// internes (lecture de tables, références, pièces jointes, dates).
//
// À charger avec un <script src="…/aucarre-grist.js"> STATIQUE dans le
// <head> (pas dans <helmet> : le runtime y injecte les scripts en
// asynchrone, donc sans garantie d'ordre), avant ./support.js et donc avant
// le script du widget. Le widget n'a rien à importer : toutes les fonctions
// ci-dessous sont des globales, à appeler directement.
//
// Règle : ne mettre ici que des fonctions SANS dépendance à un widget
// (pas de nom de table ou de colonne en dur, pas de this/state). Quand un
// widget a besoin d'une variante, il la garde chez lui.
//
// Sections : RÉESSAI · TABLES · VALEURS GRIST · SCHÉMA · PIÈCES JOINTES · DATES ·
//            ERREURS · IDENTITÉ · CYCLE DE VIE DU WIDGET
// ==========================================================

/* ---------- RÉESSAI ---------- */

// Réessaie une fonction asynchrone plusieurs fois avec un délai croissant.
// Utile pour absorber les courses de timing juste après que Grist réactive
// le widget (changement de page/table puis retour) : la connexion technique
// avec Grist n'est parfois pas totalement rétablie au moment du tout premier
// appel, ce qui renvoie une table incomplète — jamais un vrai problème de
// données, juste une question de quelques centaines de millisecondes.
async function reessayer(fn, tentativesMax, delaiMs) {
  let derniereErreur;
  for (let i = 0; i < tentativesMax; i++) {
    try { return await fn(); }
    catch (e) {
      derniereErreur = e;
      if (i < tentativesMax - 1) await new Promise(r => setTimeout(r, delaiMs * (i + 1)));
    }
  }
  throw derniereErreur;
}

/* ---------- TABLES ---------- */

// Charge plusieurs tables d'un coup, avec réessai. Une table sans "id"
// signale une réponse Grist encore incomplète (voir reessayer ci-dessus) :
// on déclenche volontairement une erreur pour que le réessai reprenne la
// main, plutôt que de planter plus loin. Retourne les tables dans l'ordre
// demandé :  const [tblA, tblB] = await chargerTables(["A", "B"]);
async function chargerTables(noms) {
  return reessayer(async () => {
    const resultats = await Promise.all(noms.map(n => window.grist.docApi.fetchTable(n)));
    if (resultats.some(t => !t || !t.id)) throw new Error("Réponse Grist incomplète, nouvelle tentative…");
    return resultats;
  }, 4, 350);
}

// fetchTable renvoie { id: [...], Colonne1: [...], Colonne2: [...] }.
// On transforme en tableau d'objets { id, Colonne1, Colonne2, ... }, plus simple à manipuler.
function tableVersLignes(table) {
  if (!table || !table.id) return [];
  const ids = table.id || [];
  const colonnes = Object.keys(table).filter(k => k !== "id" && k !== "manualSort");
  return ids.map((id, i) => {
    const ligne = { id };
    for (const c of colonnes) ligne[c] = table[c][i];
    return ligne;
  });
}

/* ---------- VALEURS GRIST ---------- */

// Une valeur "Choice List" / RefList peut revenir en tableau simple ["a","b"]
// ou au format interne Grist ["L", "a", "b"] selon le contexte — on gère les deux.
function normaliserListe(v) {
  if (Array.isArray(v)) return v[0] === "L" ? v.slice(1) : v;
  return [];
}

// Une référence (Ref) peut revenir en entier simple, ou au format interne
// Grist ["R", "NomTable", id] — idem, on gère les deux par prudence.
function normaliserRef(v) {
  if (typeof v === "number") return v;
  if (Array.isArray(v) && v[0] === "R") return v[2];
  return null;
}

// Une colonne restreinte par ACL (cellule refusée) revient sous la forme ["C"].
// Une vraie valeur de la colonne Email est une chaîne non vide.
function estValeurAutorisee(v) {
  return typeof v === "string" && v.length > 0;
}

/* ---------- SCHÉMA ---------- */

// Va chercher, dans le schéma technique du document (tables _grist_Tables /
// _grist_Tables_column — cf. guide de survie, section 2.3), la liste des
// choix configurés sur une ou plusieurs colonnes de type Choix / Choix
// multiple. C'est plus fiable que de déduire les valeurs possibles des
// données déjà présentes : ça fonctionne dès la première ligne saisie, et ça
// reste à jour automatiquement si la liste de choix change un jour dans Grist.
// Retourne { NomColonne: [choix…], … } — un objet vide si le schéma est
// inaccessible (pas bloquant : les listes restent simplement vides).
async function chargerChoixColonnes(nomTable, nomsColonnes) {
  try {
    const [tblTables, tblColonnes] = await Promise.all([
      window.grist.docApi.fetchTable("_grist_Tables"),
      window.grist.docApi.fetchTable("_grist_Tables_column")
    ]);
    const idxTable = tblTables.tableId.indexOf(nomTable);
    if (idxTable === -1) return {};
    const idInterne = tblTables.id[idxTable];

    const resultat = {};
    for (const nomColonne of nomsColonnes) {
      let choix = [];
      for (let i = 0; i < tblColonnes.id.length; i++) {
        if (tblColonnes.parentId[i] === idInterne && tblColonnes.colId[i] === nomColonne) {
          try {
            const options = JSON.parse(tblColonnes.widgetOptions[i] || "{}");
            if (Array.isArray(options.choices)) choix = options.choices;
          } catch (e) { /* colonne sans widgetOptions exploitable, on laisse vide */ }
          break;
        }
      }
      resultat[nomColonne] = choix;
    }
    return resultat;
  } catch (e) {
    return {};
  }
}

/* ---------- PIÈCES JOINTES (voie REST — cf. guide de survie, section 4) ---------- */

// ----- Correctif docId court/canonique — copié tel quel du guide de survie,
// section 4, validé avec la sonde sonde-upload-piece-jointe.html -----
function decodeJwtDocId(token) {
  try {
    const payloadB64 = token.split(".")[1];
    let normalized = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    while (normalized.length % 4) normalized += "=";
    const payload = JSON.parse(atob(normalized));
    return payload && payload.docId ? payload.docId : null;
  } catch (e) { return null; }
}
function buildApiBase(tokenInfo) {
  const canonicalDocId = decodeJwtDocId(tokenInfo.token);
  const m = tokenInfo.baseUrl.match(/^(.*\/api\/docs\/)([^\/?]+)$/);
  if (m && canonicalDocId && m[2] !== canonicalDocId) return m[1] + canonicalDocId;
  return tokenInfo.baseUrl;
}

// Envoie UN fichier (File ou Blob) vers les pièces jointes du document et
// retourne l'id de la pièce jointe créée. Lève une erreur si Grist refuse
// l'envoi ou répond autre chose que la liste d'ids attendue. `nom` est
// obligatoire pour un Blob (qui n'a pas de nom propre).
async function uploaderPieceJointe(fichier, nom) {
  const tokenInfo = await window.grist.docApi.getAccessToken({});
  const apiBase = buildApiBase(tokenInfo);
  const fd = new FormData();
  fd.append("upload", fichier, nom || fichier.name);
  const res = await fetch(apiBase + "/attachments?auth=" + tokenInfo.token, {
    method: "POST",
    headers: { "X-Requested-With": "XMLHttpRequest" },
    body: fd
  });
  if (!res.ok) throw new Error("Upload refusé (HTTP " + res.status + ")");
  const data = await res.json();
  if (!Array.isArray(data) || !data.length) throw new Error("Réponse d'upload inattendue : " + JSON.stringify(data));
  return data[0];
}

/* ---------- DATES ---------- */

function ajouterJours(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
function memeJourCalendaire(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/* ---------- ERREURS ---------- */

// Texte lisible d'une erreur quelconque (Error, chaîne, objet inattendu).
function messageErreur(e) {
  return e && e.message ? e.message : String(e);
}

/* ---------- IDENTITÉ ---------- */

// La seule ligne dont le champ email n'est pas censuré par l'ACL est celle de
// la personne connectée. `champEmail` : nom du champ dans l'objet ligne
// ("Email" pour une ligne brute de Grist, "email" pour une ligne déjà
// transformée). Retourne la ligne, ou null si personne n'est identifiable.
function trouverMoi(lignes, champEmail) {
  return lignes.find(l => estValeurAutorisee(l[champEmail])) || null;
}

/* ---------- CYCLE DE VIE DU WIDGET ---------- */

// À étaler dans le "state" de chaque widget, avec ETAT_INITIAL_PORTAIL :
//   state = { ...ETAT_INITIAL_PORTAIL, ...ETAT_INITIAL_BASE, /* le reste */ };
// status : "loading" | "ready" | "error" — le widget passe à "ready" (ou
// "error" + errorMessage) à la fin de sa méthode chargerDonnees().
const ETAT_INITIAL_BASE = {
  status: "loading",
  errorMessage: ""
};

// Au début de renderVals() :
//   const statut = calculerStatutRenderVals(s);
//   if (!statut.isReady) return statut;
// puis, dans l'objet retourné à l'état prêt :  ...statut,
function calculerStatutRenderVals(etat) {
  if (etat.status === "loading") return { isLoading: true, isError: false, isReady: false };
  if (etat.status === "error") return { isLoading: false, isError: true, isReady: false, errorMessage: etat.errorMessage };
  return { isLoading: false, isError: false, isReady: true };
}

// Classe de base des widgets : appelle grist.ready() puis this.demarrer().
// Une fonction (et non une classe déclarée directement) parce que DCLogic
// n'existe qu'une fois support.js chargé — le widget la reçoit en argument :
//   class Component extends creerBaseWidget(DCLogic) {
//     state = { ...ETAT_INITIAL_PORTAIL, ...ETAT_INITIAL_BASE, /* … */ };
//     async chargerDonnees() { … }   // appelée par demarrer() par défaut
//     demarrer() { this.chargerSchema(); this.chargerDonnees(); }  // optionnel
//   }
// options.requiredAccess : niveau d'accès demandé à Grist ("full" par défaut).
function creerBaseWidget(DCLogic, options) {
  const requiredAccess = (options && options.requiredAccess) || "full";
  return class BaseWidget extends DCLogic {
    componentDidMount() {
      try {
        window.grist.ready({ requiredAccess });
      } catch (e) {
        this.setState({ status: "error", errorMessage: "grist.ready() a échoué : " + e.message });
        return;
      }
      this.demarrer();
    }
    // Par défaut : charger les données. À surcharger si le widget a d'autres
    // chargements à lancer au démarrage (ex. un schéma).
    demarrer() {
      this.chargerDonnees();
    }
  };
}
