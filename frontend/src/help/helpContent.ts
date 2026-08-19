/** 使用说明版本，须与根目录 VERSION 一致 */
export const HELP_DOC_VERSION = "20260819-28";

export type HelpSectionMeta = {
  id: string;
  advanced?: boolean;
};

export const HELP_SECTION_META: HelpSectionMeta[] = [
  { id: "login" },
  { id: "password" },
  { id: "open" },
  { id: "network" },
  { id: "presets" },
  { id: "wallets" },
  { id: "decor" },
  { id: "scenarios" },
  { id: "members" },
  { id: "member-plan" },
  { id: "license" },
  { id: "open-wallets" },
  { id: "update" },
];
