import en from "./en";
const ja = {
  ...en,
  common: { ...en.common, home: "ホーム", login: "ログイン", register: "登録", logout: "ログアウト", admin: "管理", save: "保存", delete: "削除", language: "言語" },
  home: { ...en.home, title: "リソースナビゲーション" },
  skins: { ...en.skins, title: "スキンライブラリ", subtitle: "コミュニティのスキンとケープを閲覧・保存し、プレイヤープロフィールに適用できます。", upload: "外観をアップロード", kindSkin: "スキン", kindCape: "ケープ", playerProfiles: "プレイヤープロフィール", wardrobe: "マイワードローブ", launcherLogin: "サードパーティーランチャーログイン", saveProfile: "プロフィールを保存", deleteProfile: "プロフィールを削除", visibilityPublic: "公開", visibilityUnlisted: "限定公開", visibilityPrivate: "非公開", copyAddress: "コピー", copied: "コピー済み" },
  admin: { ...en.admin, title: "管理コンソール", i18n: "多言語管理", translationManager: "翻訳管理" },
};
export default ja;
