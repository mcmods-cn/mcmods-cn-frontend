export type AdminPanelId =
  | "overview"
  | "auth"
  | "mail"
  | "permissions"
  | "users"
  | "content"
  | "review"
  | "security"
  | "ops";

export type NavGroup = {
  id: AdminPanelId;
  label: string;
  items: string[];
};

export const adminNavigation: NavGroup[] = [
  {
    id: "overview",
    label: "统计",
    items: ["总览", "用户统计", "上传统计", "下载统计", "搜索统计", "AI 调用统计"],
  },
  {
    id: "content",
    label: "内容管理",
    items: ["模组 Mod", "整合包", "插件 Plugin", "衍生资源", "教程", "新闻", "问题 / 讨论"],
  },
  {
    id: "users",
    label: "用户",
    items: ["用户列表", "登录记录", "设备记录", "账号安全", "用户封禁"],
  },
  {
    id: "permissions",
    label: "权限",
    items: ["权限组", "用户权限", "权限列表", "权限模板", "临时权限", "权限审计日志"],
  },
  {
    id: "review",
    label: "审核",
    items: ["待审核项", "新建内容审核", "编辑审核", "文件审核", "举报审核", "申诉审核"],
  },
  {
    id: "mail",
    label: "邮件系统",
    items: ["SMTP 配置", "验证码模板", "安全通知模板", "测试发送", "发送日志"],
  },
  {
    id: "security",
    label: "安全",
    items: ["小黑屋", "IP 黑名单", "设备黑名单", "风险账号", "内容安全"],
  },
  {
    id: "ops",
    label: "系统设置",
    items: ["系统信息", "数据库", "缓存管理", "OSS 管理", "主题", "功能开关", "维护模式"],
  },
];

export const contentModules = [
  { name: "模组 Mod", status: "一期核心", owner: "content-service", review: "必审" },
  { name: "整合包", status: "配置占位", owner: "content-service", review: "必审" },
  { name: "插件 Plugin", status: "配置占位", owner: "content-service", review: "必审" },
  { name: "衍生资源", status: "配置占位", owner: "file-service", review: "必审" },
  { name: "新闻", status: "配置占位", owner: "content-service", review: "可选" },
  { name: "问题 / 讨论", status: "配置占位", owner: "review-service", review: "举报后审" },
];

export const reviewQueues = [
  { name: "新建内容审核", sla: "24 小时", permission: "content.review" },
  { name: "编辑审核", sla: "12 小时", permission: "content.review" },
  { name: "文件审核", sla: "4 小时", permission: "content.review" },
  { name: "举报审核", sla: "8 小时", permission: "content.review" },
];
