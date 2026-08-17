import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { Network, Role } from "../src/types.js";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("Branch@123456", 10);
  await prisma.user.upsert({
    where: { username: "admin" },
    update: { displayName: "精简版管理员" },
    create: {
      username: "admin",
      passwordHash,
      displayName: "精简版管理员",
      role: Role.SUPER_ADMIN,
    },
  });

  const low = [
    { address: "TVxb8FbBsms48rpEXZxSKy7wc8wtYn68A7", name: "精简版财务", sortOrder: 1 },
    { address: "TAjJb7HxxMjokeHeyf77H7zQsd1vVkKmix", name: "精简版安全", sortOrder: 2 },
  ];

  for (const network of [Network.shasta, Network.mainnet]) {
    for (const row of low) {
      await prisma.presetSigner.upsert({
        where: {
          network_group_ownerUserId_address: {
            network,
            group: "LOW",
            ownerUserId: "branch",
            address: row.address,
          },
        },
        update: { name: row.name, sortOrder: row.sortOrder, active: true },
        create: { network, group: "LOW", ownerUserId: "branch", ...row, active: true },
      });
    }
    const usdt =
      network === Network.shasta
        ? process.env.USDT_CONTRACT_SHASTA || "TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs"
        : process.env.USDT_CONTRACT_MAINNET || "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
    await prisma.trc20Token.upsert({
      where: { network_contract: { network, contract: usdt } },
      update: { symbol: "USDT", isStableUsd: true, active: true },
      create: {
        network,
        symbol: "USDT",
        contract: usdt,
        decimals: 6,
        isStableUsd: true,
        active: true,
      },
    });
  }

  await prisma.priceQuote.upsert({
    where: { symbol: "USDT" },
    update: { priceUsdt: 1 },
    create: { symbol: "USDT", priceUsdt: 1 },
  });

  await prisma.appSetting.upsert({
    where: { key: "active_network" },
    update: {},
    create: { key: "active_network", value: Network.shasta },
  });

  await prisma.appSetting.upsert({
    where: { key: "ad_side_html" },
    update: {},
    create: {
      key: "ad_side_html",
      value:
        '<a href="https://www.example.com" target="_blank" rel="noopener">前往交易站 · 注册有礼</a>',
    },
  });
  await prisma.appSetting.upsert({
    where: { key: "ad_bottom_html" },
    update: {},
    create: {
      key: "ad_bottom_html",
      value: "免费多签由交易站提供技术支持",
    },
  });
  await prisma.appSetting.upsert({
    where: { key: "exchange_url" },
    update: {},
    create: { key: "exchange_url", value: "https://www.example.com" },
  });

  console.log("Seed OK: admin / Branch@123456");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
