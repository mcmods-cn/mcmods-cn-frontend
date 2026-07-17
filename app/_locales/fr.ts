import en from "./en";
const fr = {
  ...en,
  common: { ...en.common, home: "Accueil", login: "Connexion", register: "Inscription", logout: "Déconnexion", admin: "Admin", save: "Enregistrer", delete: "Supprimer", language: "Langue" },
  home: { ...en.home, title: "Navigation des ressources" },
  skins: { ...en.skins, title: "Bibliothèque de skins", subtitle: "Parcourez et équipez des skins et capes de la communauté sur vos profils de joueur.", upload: "Importer une apparence", kindSkin: "Skin", kindCape: "Cape", playerProfiles: "Profils de joueur", wardrobe: "Ma garde-robe", launcherLogin: "Connexion via lanceur tiers", saveProfile: "Enregistrer le profil", deleteProfile: "Supprimer le profil", visibilityPublic: "Public", visibilityUnlisted: "Non répertorié", visibilityPrivate: "Privé", copyAddress: "Copier", copied: "Copié" },
  admin: { ...en.admin, title: "Console admin", i18n: "Gestion multilingue", translationManager: "Gestion des traductions" },
};
export default fr;
