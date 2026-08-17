#!/usr/bin/env node
// 始终用正斜杠写 zip 条目，避免 Windows 打包后 Linux unzip 解压异常。
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const stage = process.argv[2];
const zipPath = process.argv[3];
if (!stage || !zipPath) {
  console.error("用法: node deploy/make-unix-zip.mjs <stageDir> <zipPath>");
  process.exit(1);
}

const absStage = path.resolve(stage);
const absZip = path.resolve(zipPath);
if (!fs.existsSync(absStage)) {
  console.error("stage 不存在:", absStage);
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "backend/package.json"));
const AdmZip = require("adm-zip");
const zip = new AdmZip();

function walk(dir, prefix) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, rel);
    else zip.addFile(rel.replace(/\\/g, "/"), fs.readFileSync(full));
  }
}

walk(absStage, "");
if (fs.existsSync(absZip)) fs.unlinkSync(absZip);
fs.mkdirSync(path.dirname(absZip), { recursive: true });
zip.writeZip(absZip);
console.log("wrote", absZip);
