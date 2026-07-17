import en from "./en";
const es = {
  ...en,
  common: { ...en.common, home: "Inicio", login: "Iniciar sesión", register: "Registrarse", logout: "Cerrar sesión", admin: "Admin", save: "Guardar", delete: "Eliminar", language: "Idioma" },
  home: { ...en.home, title: "Navegación de recursos" },
  skins: { ...en.skins, title: "Biblioteca de skins", subtitle: "Explora, guarda y equipa skins y capas de la comunidad en tus perfiles de jugador.", upload: "Subir apariencia", kindSkin: "Skin", kindCape: "Capa", playerProfiles: "Perfiles de jugador", wardrobe: "Mi armario", launcherLogin: "Inicio de sesión en lanzadores externos", saveProfile: "Guardar perfil", deleteProfile: "Eliminar perfil", visibilityPublic: "Público", visibilityUnlisted: "No listado", visibilityPrivate: "Privado", copyAddress: "Copiar", copied: "Copiado" },
  admin: { ...en.admin, title: "Consola admin", i18n: "Gestión multilingüe", translationManager: "Gestión de traducciones" },
};
export default es;
