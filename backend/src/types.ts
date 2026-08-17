export const Role = {
  SUPER_ADMIN: "SUPER_ADMIN",
  EMPLOYEE: "EMPLOYEE",
  MEMBER: "MEMBER",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

/** 精简版默认多签地址归属键（非 User.id） */
export const BRANCH_PRESET_OWNER = "branch";

export const Network = {
  mainnet: "mainnet",
  shasta: "shasta",
} as const;
export type Network = (typeof Network)[keyof typeof Network];

export const Tier = {
  TWO_OF_THREE: "TWO_OF_THREE",
  THREE_OF_FIVE: "THREE_OF_FIVE",
  THREE_OF_FOUR: "THREE_OF_FOUR",
} as const;
export type Tier = (typeof Tier)[keyof typeof Tier];

export const OpenStatus = {
  PENDING: "PENDING",
  PREPARED: "PREPARED",
  BROADCASTED: "BROADCASTED",
  FAILED: "FAILED",
} as const;
export type OpenStatus = (typeof OpenStatus)[keyof typeof OpenStatus];
