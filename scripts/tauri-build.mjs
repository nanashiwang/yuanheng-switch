import { execFileSync } from "node:child_process";

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const args = ["tauri", "build"];
const config = {
  build: {
    // Core 已在 Tauri 读取 externalBin 前生成，这里只需构建前端。
    beforeBuildCommand: "pnpm run build:renderer",
  },
};

execFileSync(process.execPath, ["scripts/prepare-core-sidecar.mjs", "release"], {
  stdio: "inherit",
  env: process.env,
});

if (!process.env.TAURI_SIGNING_PRIVATE_KEY) {
  console.log("未配置 Tauri 更新签名私钥，本地构建将跳过 updater artifacts。");
  config.bundle = {
    createUpdaterArtifacts: false,
  };
}

args.push("--config", JSON.stringify(config));

execFileSync(pnpm, args, {
  stdio: "inherit",
  env: process.env,
});
