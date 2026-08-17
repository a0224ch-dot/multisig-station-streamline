/**
 * 精简版「使用说明」。HELP_DOC_VERSION 须与根目录 VERSION 一致。
 */
export const HELP_DOC_VERSION = "20260817-1";

export type HelpSection = {
  id: string;
  title: string;
  advanced?: boolean;
  steps: string[];
  tips?: string[];
};

export const HELP_SECTIONS: HelpSection[] = [
  {
    id: "login",
    title: "〇、登录",
    steps: [
      "管理后台入口：/branch/login（需账号、密码与图形验证码）。",
      "公网页 / 供客户扫码开通，无需登录后台。",
      "同一账号或同一来源 IP 连续失败约 5 次后，会暂时限制登录约 15 分钟。",
    ],
    tips: [
      "上线后请立即修改默认管理员密码。",
    ],
  },
  {
    id: "password",
    title: "〇·二、修改密码",
    steps: [
      "登录后台后点「修改密码」，验证当前密码后设新密码。",
    ],
  },
  {
    id: "open",
    title: "一、公网页开通多签",
    steps: [
      "客户打开本站公网页（首页），用钱包 App 扫码或打开开通链接。",
      "在钱包内完成签名后即开通；地址不变，权限变为多人共管。",
      "开通码有时效；过期让客户刷新公网页重新取码。",
    ],
    tips: [
      "请先在「多签地址」配好共管地址，并在「开通钱包」启用常用钱包入口。",
    ],
  },
  {
    id: "presets",
    title: "二、多签地址",
    steps: [
      "打开「多签地址」，为本站配置共管地址（恰好 2 个）。",
      "保存前请核对地址与网络（主网 / Shasta）。",
    ],
  },
  {
    id: "wallets",
    title: "三、已开通",
    steps: [
      "打开「已开通」，查看本站公网页开通成功的地址（只读）。",
    ],
  },
  {
    id: "decor",
    title: "四、公网页装修",
    steps: [
      "改标题、正文、底部文案与图片，保存后公网页立即生效。",
      "可复制长期入口链接给客户使用。",
    ],
  },
  {
    id: "open-wallets",
    title: "五、开通钱包",
    steps: [
      "启用客户开通时可用的钱包入口（如 TronLink、OKX 等）。",
      "未启用任何入口时，客户只能在已注入钱包的环境里完成签名。",
    ],
  },
  {
    id: "update",
    title: "六、系统更新",
    steps: [
      "「系统更新」→ 检查更新 → 立即更新。",
      "更新会保留 .env 与数据库。",
    ],
  },
];
