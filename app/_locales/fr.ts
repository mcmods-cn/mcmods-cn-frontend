import en from "./en";
const fr = {
  ...en,
  common: { ...en.common, home: "Accueil", login: "Connexion", register: "Inscription", logout: "Déconnexion", admin: "Admin", save: "Enregistrer", delete: "Supprimer", language: "Langue" },
  home: { ...en.home, title: "Navigation des ressources" },
  admin: { ...en.admin, title: "Console admin", i18n: "Gestion multilingue", translationManager: "Gestion des traductions" },
};
export default fr;
