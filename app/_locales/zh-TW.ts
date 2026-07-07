import zhCN from "./zh-CN";
const zhTW: typeof zhCN = {
  ...zhCN,
  common: { ...zhCN.common, home: "首頁", login: "登入", register: "註冊", logout: "登出", admin: "後台", save: "儲存", delete: "刪除", language: "語言" },
  home: { ...zhCN.home, title: "資源導覽" },
  admin: { ...zhCN.admin, title: "後台管理", i18n: "多語言管理", translationManager: "翻譯管理" },
};
export default zhTW;
