#!/usr/bin/env node
// package.json 的 bin 指向这里：找到下载好的 Go 二进制并启动它。
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { exeName } = require("./lib/platform");
const { launch } = require("./lib/launch");

const bin = path.join(__dirname, "bin", exeName("native-demo-go"));

// npx 临时运行、--ignore-scripts、pnpm 默认不跑依赖的脚本时，postinstall 都不会执行：首次运行时补装。
if (!fs.existsSync(bin)) {
  try {
    execFileSync(process.execPath, [path.join(__dirname, "install.js")], { stdio: "inherit" });
  } catch {
    process.exit(1);
  }
}

launch(bin, process.argv.slice(2), {
  NATIVE_DEMO_LAUNCHER: "node-shim",
  NATIVE_DEMO_MANAGED_BY: "npm",
});
