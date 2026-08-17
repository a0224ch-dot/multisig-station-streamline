type ChainReject = { code?: unknown; message?: unknown };

const CODE_HINTS: Record<string, string> = {
  TRANSACTION_EXPIRATION_ERROR: "交易已过期，请返回重新扫码开通。",
  DUP_TRANSACTION_ERROR: "该交易已提交过，请稍后在链上确认结果。",
  SIGERROR: "签名校验不通过，请确认签名用的是本人钱包地址。",
  TAPOS_ERROR: "交易引用的区块已失效，请重新开通。",
  BANDWITH_ERROR: "账户带宽不足，请补充 TRX 后重试。",
  SERVER_BUSY: "链上节点繁忙，请稍后重试。",
};

/** 节点返回的 message 多为 hex，解码后再翻译成可读文案 */
export function describeChainReject(result: ChainReject): string {
  const code = typeof result?.code === "string" ? result.code : "";
  const raw = typeof result?.message === "string" ? result.message : "";

  let text = raw;
  if (raw && /^[0-9a-fA-F]+$/.test(raw) && raw.length % 2 === 0) {
    try {
      const decoded = Buffer.from(raw, "hex").toString("utf8");
      if (decoded && !/[\u0000-\u0008]/.test(decoded)) text = decoded;
    } catch {
      /* 解不开就用原文 */
    }
  }

  if (/balance is not sufficient/i.test(text)) {
    return "钱包 TRX 余额不足：修改账户权限需要约 100 TRX 手续费，请充值后重试。";
  }
  if (/Permission denied|not contained of permission/i.test(text)) {
    return "该地址已是多签账户，本人已无单签权限，无法再次开通。请联系管理员处理。";
  }
  if (CODE_HINTS[code]) return CODE_HINTS[code];
  if (text) return `链上拒绝该交易：${text}`;
  return code ? `链上拒绝该交易（${code}）` : "广播失败，请重试。";
}
