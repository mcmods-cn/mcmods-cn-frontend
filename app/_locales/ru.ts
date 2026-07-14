import en from "./en";
const ru = {
  ...en,
  common: { ...en.common, home: "Главная", login: "Войти", register: "Регистрация", logout: "Выйти", admin: "Админ", save: "Сохранить", delete: "Удалить", language: "Язык" },
  home: { ...en.home, title: "Навигация по ресурсам" },
  admin: { ...en.admin, title: "Панель администрирования", i18n: "Управление языками", translationManager: "Управление переводами" },
};
export default ru;
