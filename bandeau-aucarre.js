/* ==========================================================
   bandeau-aucarre.js — bandeau « au carré » FIXE, autonome.

   UTILISATION (dans le <head> du widget, une seule ligne) :

     <script src="https://nicolasschena-aucarre.github.io/Aucarre/bandeau-aucarre.js"
             data-titre="Nom du widget"></script>

   Le bandeau est le même pour toute l'entreprise : rien ne se règle, ni dans
   des tables Grist ni ailleurs. Il ne demande AUCUN accès à Grist : il marche
   dans un widget en lecture seule comme dans un widget en accès complet.

   Disposition, de gauche à droite :
     logo (non cliquable) | séparateur | titre   ...   nom + avatar | burger

   LE TITRE : attribut data-titre de la balise <script> (facultatif ; sans
   titre, le séparateur disparaît aussi).

   LE MENU (burger) : la liste des outils est lue UNE fois, à la première
   ouverture, dans portail.json :

     [ { "nom": "Suivi du temps",  "url": "https://..." },
       { "nom": "Suivi de projet", "url": "https://...", "roles": ["Manager"] } ]

   Les entrées sans nom, ou dont l'adresse n'est pas http(s), sont ignorées.

   LES RÔLES : « roles » (facultatif) limite une entrée aux personnes ayant l'un
   de ces rôles (sans tenir compte de la casse ni des accents).
     - absent, null, "" ou [] ........ visible par tout le monde
     - ["Manager"] ou "Manager" ...... visible des seuls Manager
     - ["Manager", "Admin"] .......... visible des Manager et des Admin
     - toute autre forme (nombre…) ... masquée (on ne montre jamais par erreur)
   Rôle de la personne INCONNU (le widget ne l'a pas transmis, personne
   d'identifié, rôle vide) : seules les entrées destinées à tout le monde
   s'affichent.
   ATTENTION : ce tri ne fait que masquer des liens dans le menu. portail.json est
   public : la vraie protection d'un widget reste dans les droits d'accès Grist.

   LA PERSONNE CONNECTÉE : le bandeau ne la cherche pas lui-même, c'est le widget
   qui la lui transmet quand il la connaît :

     window.BandeauAuCarre.utilisateur({ nomComplet: "Gaylord Leroy", role: "Manager" });
     window.BandeauAuCarre.utilisateur({ prenom: "Paul", nom: "Durand" });  // sans rôle
     window.BandeauAuCarre.utilisateur(null);                               // « Non identifié·e »

   « role » : le texte de la colonne de rôle, ou une liste de choix de Grist
   (["L", "Manager"]). Il peut être transmis après la première ouverture du menu :
   le menu se met à jour tout seul.

   Tant que le widget n'appelle pas utilisateur(), le bloc nom + avatar reste
   masqué (cas d'un widget qui n'identifie personne).

   LA CHARTE : les couleurs suivent les variables --ac-* de aucarre-ui.css quand
   la page les définit (une seule source de vérité) ; sinon les valeurs de repli
   ci-dessous s'appliquent, et le bandeau reste autonome.
   ========================================================== */
(function () {
  "use strict";

  if (window.BandeauAuCarre) return; // fichier chargé deux fois : une seule instance

  var VERSION = "2026-10-06-au-carre-6";
  console.info("[bandeau-aucarre] version " + VERSION);

  // ---- Configuration (seul endroit à éditer) --------------------------------
  // portail.json et logo.png sont cherchés dans le MÊME dossier que ce fichier : renommer le
  // dépôt GitHub ne demande donc aucune modification ici (seules les balises <script> des
  // widgets changent). Adresse de repli si le script n'a pas été chargé par une balise statique.
  var DOSSIER_PAR_DEFAUT = "https://nicolasschena-aucarre.github.io/Aucarre/";
  // ---------------------------------------------------------------------------

  var script = document.currentScript;
  var dossier = script && script.src ? script.src.split(/[?#]/)[0].replace(/[^\/]*$/, "") : DOSSIER_PAR_DEFAUT;
  var URL_PORTAIL = dossier + "portail.json";
  var URL_LOGO = dossier + "logo.png";
  var titre = ((script && script.dataset && script.dataset.titre) || "").trim();

  var ui = null;                 // éléments du bandeau, une fois construit
  var moi;                       // undefined : non transmis ; null : non identifié
  var rolesMoi = [];             // rôles de la personne, normalisés ([] = inconnu)
  var outils = null;             // contenu de portail.json, une fois lu
  var menuEtat = "initial";      // initial | chargement | pret

  // Style du bandeau, isolé dans le Shadow DOM. var(--ac-x, repli) : la charte de
  // la page l'emporte quand elle existe.
  var CSS = [
    ":host{display:block;position:sticky;top:0;z-index:20;flex:none;font-family:Montserrat,Arial,sans-serif;-webkit-font-smoothing:antialiased}",
    "*{box-sizing:border-box}",
    ".pm-header{background:var(--ac-white,#ffffff);color:var(--ac-black,#090c0b);padding:0 24px;border-bottom:1.5px solid var(--ac-black,#090c0b)}",
    ".pm-header-inner{max-width:1240px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:24px;min-height:72px;padding:8px 0;flex-wrap:wrap}",
    ".pm-brand{display:flex;align-items:center;gap:12px;min-width:0}",
    // Marge de 6 px autour du logo : même hauteur de bandeau (89 px) et même position du logo
    // que l'ancien bandeau, où le logo était dans un bouton de 6 px de marge intérieure.
    ".pm-brand-logo{height:60px;width:auto;flex:none;display:block;margin:6px}",
    ".pm-brand-sep{width:1px;height:20px;background:rgba(9,12,11,.18)}",
    ".pm-brand-sub{font-size:14px;font-weight:500}",
    ".pm-brand-sep[hidden],.pm-brand-sub[hidden],.pm-user[hidden],.pm-portail-menu[hidden]{display:none}",
    ".pm-droite{display:flex;align-items:center;gap:16px}",
    ".pm-user{display:flex;align-items:center;gap:8px}",
    ".pm-user-name{font-size:14px;font-weight:500}",
    ".pm-avatar{width:38px;height:38px;border-radius:50%;background:var(--ac-turquoise,#45f8cf);color:var(--ac-black,#090c0b);display:grid;place-items:center;font-size:13px;font-weight:800}",
    ".pm-burger-wrap{position:relative}",
    ".pm-burger{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;width:44px;height:44px;padding:0;border:none;border-radius:8px;background:none;color:inherit;cursor:pointer}",
    ".pm-burger:hover{background:var(--ac-grey-light,#f2f2f2)}",
    ".pm-burger span{display:block;width:22px;height:2.5px;border-radius:2px;background:currentColor}",
    ".pm-burger:focus-visible,.pm-portail-menu a:focus-visible{outline:3px solid var(--ac-black,#090c0b);outline-offset:2px}",
    ".pm-portail-menu{position:absolute;top:calc(100% + 8px);right:0;z-index:50;min-width:220px;max-width:min(90vw,360px);background:var(--ac-white,#ffffff);border:1.5px solid var(--ac-black,#090c0b);border-radius:var(--ac-radius-sm,8px);box-shadow:4px 4px 0 var(--ac-black,#090c0b);padding:8px}",
    ".pm-portail-menu a{display:block;padding:8px 10px;border-radius:6px;text-decoration:none;color:var(--ac-black,#090c0b);font-size:13.5px;font-weight:500}",
    ".pm-portail-menu a:hover,.pm-portail-menu a:focus-visible{background:var(--ac-grey-light,#f2f2f2);color:var(--ac-black,#090c0b)}",
    ".pm-portail-vide{margin:0;padding:8px 10px;font-size:13px;color:var(--ac-grey-dark,#59736e)}",
    // Écran étroit : marges latérales de 16 px, comme celles du contenu des widgets.
    "@media (max-width:600px){.pm-header{padding:0 16px}}"
  ].join("");

  // Mise en page de la PAGE (hors Shadow DOM) : bandeau + contenu en colonne, le
  // contenu prenant le reste de la fenêtre. Sans cela, le runtime x-dc impose
  // #dc-root{height:100%} et la page défile de la hauteur du bandeau. Limité aux
  // widgets x-dc (:has(> #dc-root)) : une autre page n'est pas touchée.
  var CSS_PAGE = [
    "html body:has(> #pm-bandeau):has(> #dc-root){display:flex;flex-direction:column;height:auto;min-height:100%}",
    "html body > #dc-root{flex:1 0 auto;height:auto}",
    "html body > #dc-root > .sc-host{height:auto}"
  ].join("");

  // ---------- Utilitaires ----------
  function el(tag, cls, attrs) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    for (var k in (attrs || {})) n.setAttribute(k, attrs[k]);
    return n;
  }

  // Seuls http(s) sont acceptés comme cible de lien.
  function urlSure(u) {
    return typeof u === "string" && /^https?:\/\//i.test(u.trim()) ? u.trim() : null;
  }

  // Minuscules, sans accents ni espaces superflus (comparaison des rôles).
  function normaliser(s) {
    return String(s == null ? "" : s).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  // Rôle de la personne : texte ou liste de choix Grist (["L", "Manager"]) -> valeurs normalisées.
  function rolesDeLaPersonne(v) {
    if (typeof v === "string") v = [v];
    if (!Array.isArray(v)) return [];
    if (v[0] === "L") v = v.slice(1);
    return v.map(normaliser).filter(Boolean);
  }

  // Rôles exigés par une entrée de portail.json : null = tout le monde, sinon la liste autorisée.
  function rolesExiges(o) {
    var r = o.roles;
    if (r === undefined || r === null || r === "") return null;
    if (typeof r === "string") r = [r];
    if (!Array.isArray(r)) return [];                    // forme inattendue : masquée par prudence
    var liste = r.map(normaliser).filter(Boolean);
    return liste.length ? liste : null;                  // [] : tout le monde
  }

  function visible(o) {
    var exiges = rolesExiges(o);
    if (exiges === null) return true;
    return rolesMoi.some(function (r) { return exiges.indexOf(r) !== -1; });
  }

  // { nomComplet } ou { prenom, nom } -> { label, initiales } ; null -> « Non identifié·e ».
  function identite(m) {
    if (!m) return { label: "Non identifié·e", initiales: "?" };
    var complet = String(m.nomComplet || "").trim();
    var prenom = String(m.prenom || "");
    var nom = String(m.nom || "");
    var initiales = prenom.charAt(0) + nom.charAt(0);
    if (complet) {
      var mots = complet.split(/\s+/);
      initiales = mots[0].charAt(0) + (mots.length > 1 ? mots[mots.length - 1].charAt(0) : "");
    }
    return { label: complet || (prenom + " " + nom).trim(), initiales: initiales.toUpperCase() };
  }

  // ---------- Construction ----------
  function construire() {
    if (document.getElementById("pm-bandeau")) return;

    var host = el("div", null, { id: "pm-bandeau" });
    var root = host.attachShadow({ mode: "open" });
    var style = el("style");
    style.textContent = CSS;

    var header = el("header", "pm-header");
    var inner = el("div", "pm-header-inner");

    // Gauche : logo (non cliquable), séparateur et titre
    var brand = el("div", "pm-brand");
    var logo = el("img", "pm-brand-logo", { src: URL_LOGO, alt: "au carré" });
    var sep = el("span", "pm-brand-sep", { "aria-hidden": "true" });
    var sub = el("span", "pm-brand-sub");
    sub.textContent = titre;
    sep.hidden = sub.hidden = !titre;
    brand.appendChild(logo);
    brand.appendChild(sep);
    brand.appendChild(sub);

    // Droite : nom + avatar, puis le burger
    var droite = el("div", "pm-droite");
    var user = el("div", "pm-user");
    user.hidden = true; // tant que le widget n'a pas transmis la personne
    var userNom = el("span", "pm-user-name");
    var avatar = el("span", "pm-avatar", { "aria-hidden": "true" });
    user.appendChild(userNom);
    user.appendChild(avatar);

    var wrap = el("div", "pm-burger-wrap");
    var btn = el("button", "pm-burger", {
      type: "button", "aria-label": "Autres outils internes", "aria-expanded": "false", "aria-controls": "pm-menu"
    });
    for (var i = 0; i < 3; i++) btn.appendChild(el("span"));
    var menu = el("nav", "pm-portail-menu", { id: "pm-menu", "aria-label": "Outils internes" });
    menu.hidden = true;
    wrap.appendChild(btn);
    wrap.appendChild(menu);

    droite.appendChild(user);
    droite.appendChild(wrap);
    inner.appendChild(brand);
    inner.appendChild(droite);
    header.appendChild(inner);
    root.appendChild(style);
    root.appendChild(header);

    ui = { host: host, user: user, userNom: userNom, avatar: avatar, btn: btn, menu: menu, wrap: wrap };

    btn.addEventListener("click", function (e) { e.stopPropagation(); basculer(menu.hidden); });
    // Un clic ailleurs dans la page referme le menu ; un clic dans le bandeau lui-même, non.
    document.addEventListener("click", function (e) {
      if (e.composedPath().indexOf(wrap) === -1) basculer(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !menu.hidden) { basculer(false); btn.focus(); }
    });

    var stylePage = el("style");
    stylePage.textContent = CSS_PAGE;
    document.head.appendChild(stylePage);
    document.body.insertBefore(host, document.body.firstChild);

    if (moi !== undefined) rendreUtilisateur();
  }

  // ---------- Personne connectée ----------
  function rendreUtilisateur() {
    if (!ui) return; // sera rendue à la construction
    var id = identite(moi);
    ui.userNom.textContent = id.label;
    ui.avatar.textContent = id.initiales;
    ui.user.hidden = false;
  }

  // ---------- Menu ----------
  function message(texte) {
    ui.menu.textContent = "";
    var p = el("p", "pm-portail-vide", { role: "status" });
    p.textContent = texte;
    ui.menu.appendChild(p);
  }

  // Affiche les outils valides ET autorisés pour la personne ; rappelé quand son rôle arrive.
  function afficherMenu() {
    var liste = outils.filter(function (o) {
      return o && typeof o.nom === "string" && o.nom.trim() && urlSure(o.url) && visible(o);
    });
    if (!liste.length) return message("Aucun outil configuré.");
    ui.menu.textContent = "";
    liste.forEach(function (o) {
      var a = el("a", null, { href: urlSure(o.url), target: "_blank", rel: "noopener" });
      a.textContent = o.nom.trim();
      ui.menu.appendChild(a);
    });
  }

  // La liste est lue à la première ouverture seulement ; un échec est retenté à
  // l'ouverture suivante.
  function chargerMenu() {
    menuEtat = "chargement";
    message("Chargement…");
    fetch(URL_PORTAIL).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    }).then(function (liste) {
      if (!Array.isArray(liste)) throw new Error("Format inattendu");
      outils = liste;
      afficherMenu();
      menuEtat = "pret";
    }).catch(function (e) {
      // Le détail (adresse, 404, JSON invalide…) est dans la console ; le menu reste sobre.
      console.warn("[bandeau-aucarre] " + URL_PORTAIL + " illisible :", e && e.message ? e.message : e);
      message("Liste indisponible.");
      menuEtat = "initial";
    });
  }

  function basculer(ouvrir) {
    ui.menu.hidden = !ouvrir;
    ui.btn.setAttribute("aria-expanded", ouvrir ? "true" : "false");
    if (ouvrir && menuEtat === "initial") chargerMenu();
  }

  // ---------- API pour le widget hôte ----------
  window.BandeauAuCarre = {
    version: VERSION,
    utilisateur: function (m) {
      moi = m || null;
      rolesMoi = rolesDeLaPersonne(moi && moi.role);
      rendreUtilisateur();
      if (outils) afficherMenu(); // le rôle peut arriver après le chargement de la liste
    },
    // Aide au diagnostic : dans la console du widget, taper  BandeauAuCarre.etat()
    // (après avoir ouvert le menu une fois, pour que portail.json soit lu).
    etat: function () {
      return {
        version: VERSION,
        portail: URL_PORTAIL,
        personne: moi === undefined ? "(le widget n'a pas appelé utilisateur())" : moi,
        rolesReconnus: rolesMoi.slice(),
        entrees: outils === null ? "(portail.json pas encore lu : ouvre le menu)" : outils.map(function (o) {
          var objet = !!o && typeof o === "object";
          return { nom: objet ? o.nom : "(entrée invalide)", roles: objet ? rolesExiges(o) : null, visible: objet && visible(o) };
        })
      };
    }
  };

  if (document.body) construire();
  else document.addEventListener("DOMContentLoaded", construire);
})();
