import en from "./en";
const de = {
  ...en,
  common: { ...en.common, home: "Start", login: "Anmelden", register: "Registrieren", logout: "Abmelden", admin: "Admin", save: "Speichern", delete: "Löschen", language: "Sprache" },
  home: { ...en.home, title: "Ressourcen-Navigation" },
  skins: { ...en.skins, title: "Skin-Bibliothek", subtitle: "Community-Skins und Umhänge durchsuchen, sammeln und Spielerprofilen zuweisen.", upload: "Aussehen hochladen", kindSkin: "Skin", kindCape: "Umhang", playerProfiles: "Spielerprofile", wardrobe: "Meine Garderobe", launcherLogin: "Drittanbieter-Launcher-Anmeldung", saveProfile: "Profil speichern", deleteProfile: "Profil löschen", visibilityPublic: "Öffentlich", visibilityUnlisted: "Nicht gelistet", visibilityPrivate: "Privat", copyAddress: "Kopieren", copied: "Kopiert" },
  admin: { ...en.admin, title: "Admin-Konsole", i18n: "Mehrsprachigkeit", translationManager: "Übersetzungen" },
};
export default de;
