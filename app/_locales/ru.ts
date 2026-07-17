import en from "./en";
const ru = {
  ...en,
  common: { ...en.common, home: "Главная", login: "Войти", register: "Регистрация", logout: "Выйти", admin: "Админ", save: "Сохранить", delete: "Удалить", language: "Язык" },
  home: { ...en.home, title: "Навигация по ресурсам" },
  skins: { ...en.skins, title: "Библиотека скинов", subtitle: "Просматривайте и назначайте скины и плащи сообщества своим игровым профилям.", upload: "Загрузить внешний вид", kindSkin: "Скин", kindCape: "Плащ", playerProfiles: "Профили игроков", wardrobe: "Мой гардероб", launcherLogin: "Вход через сторонний лаунчер", saveProfile: "Сохранить профиль", deleteProfile: "Удалить профиль", visibilityPublic: "Публичный", visibilityUnlisted: "По ссылке", visibilityPrivate: "Приватный", copyAddress: "Копировать", copied: "Скопировано" },
  admin: { ...en.admin, title: "Панель администрирования", i18n: "Управление языками", translationManager: "Управление переводами" },
};
export default ru;
