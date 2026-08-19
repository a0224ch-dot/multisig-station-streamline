/*!
 * Multisig Scene Starter — free to copy and publish.
 * Only configure entryUrl (streamline public home). Do NOT hardcode wallet deep links.
 */
window.SCENE_CONFIG = {
  /** 必填：精简版开通页，例如 https://your-streamline.example/open */
  entryUrl: "https://multisig-station-streamline.iqiyia.cyou/open",

  /**
   * 可选：开通完成后跳回本页（若站点开启回跳校验，须在白名单中）。
   * 留空则开通完留在多签站成功页。
   * 本地文件打开时无法做可靠回跳，请用本地静态服务器或部署到 https 域名。
   */
  returnUrl: "",

  /** 可选：业务单号前缀，会变成 ref=demo-时间戳 */
  refPrefix: "demo",
};
