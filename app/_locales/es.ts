import en from "./en";
const es = {
  ...en,
  common: { ...en.common, home: "Inicio", login: "Iniciar sesión", register: "Registrarse", logout: "Cerrar sesión", admin: "Admin", save: "Guardar", delete: "Eliminar", language: "Idioma" },
  home: { ...en.home, title: "Navegación de recursos" },
  admin: { ...en.admin, title: "Consola admin", i18n: "Gestión multilingüe", translationManager: "Gestión de traducciones" },
};
export default es;
