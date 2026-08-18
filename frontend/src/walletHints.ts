import type { TFunction } from "i18next";

/** 后台返回的中文 hint 按钱包 id 映射为当前语言 */
export function localizedWalletHint(id: string, fallback: string, t: TFunction): string {
  const key = `walletHints.${id}`;
  const translated = t(key);
  return translated !== key ? translated : fallback;
}
