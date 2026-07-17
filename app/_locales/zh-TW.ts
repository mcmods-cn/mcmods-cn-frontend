import zhCN from "./zh-CN";
const zhTW = {
  ...zhCN,
  common: { ...zhCN.common, home: "首頁", login: "登入", register: "註冊", logout: "登出", admin: "後台", save: "儲存", delete: "刪除", language: "語言" },
  home: { ...zhCN.home, title: "資源導覽" },
  skins: { ...zhCN.skins, title: "造型庫", subtitle: "瀏覽、收藏並套用社群皮膚與披風，也可透過第三方啟動器登入玩家檔案。", upload: "上傳造型", kindSkin: "皮膚", kindCape: "披風", playerProfiles: "玩家檔案", wardrobe: "我的衣櫃", launcherLogin: "第三方啟動器登入", saveProfile: "儲存檔案", deleteProfile: "刪除玩家檔案", visibilityPublic: "公開", visibilityUnlisted: "不公開列出", visibilityPrivate: "僅自己可見", copyAddress: "複製", copied: "已複製" },
  admin: { ...zhCN.admin, title: "後台管理", i18n: "多語言管理", translationManager: "翻譯管理" },
};
export default zhTW;
