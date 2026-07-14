import en from "./en";
const ja = {
  ...en,
  common: { ...en.common, home: "ホーム", login: "ログイン", register: "登録", logout: "ログアウト", admin: "管理", save: "保存", delete: "削除", language: "言語" },
  home: { ...en.home, title: "リソースナビゲーション" },
  admin: { ...en.admin, title: "管理コンソール", i18n: "多言語管理", translationManager: "翻訳管理" },
};
export default ja;
