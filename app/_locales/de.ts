import en from "./en";
const de = {
  ...en,
  common: { ...en.common, home: "Start", login: "Anmelden", register: "Registrieren", logout: "Abmelden", admin: "Admin", save: "Speichern", delete: "Löschen", language: "Sprache" },
  home: { ...en.home, title: "Ressourcen-Navigation" },
  admin: { ...en.admin, title: "Admin-Konsole", i18n: "Mehrsprachigkeit", translationManager: "Übersetzungen" },
};
export default de;
