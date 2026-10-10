#!/usr/bin/env node
// 子包型（参考 @biomejs/biome、esbuild）：二进制在平台子包里，由包管理器按 os/cpu 只装匹配的那个。
// 这个启动器负责找到子包里的二进制并启动它。
const { PLATFORMS, currentKey, exeName, unsupported } = require("./lib/platform");
const { launch } = require("./lib/launch");

const pkg = require("./package.json");
const key = currentKey();
if (!PLATFORMS[key]) {
  console.error(unsupported(key));
  process.exit(1);
}

const subpackage = `${pkg.name}-${key}`;
// 允许用环境变量指定一个自己的二进制，绕过 npm 里的版本（调试、自行编译的平台）。
let bin = process.env.NATIVE_DEMO_BINARY;
if (!bin) {
  try {
    bin = require.resolve(`${subpackage}/bin/${exeName("native-demo-rs")}`);
  } catch {
    console.error(
      `找不到平台子包 ${subpackage}。\n` +
        "通常是安装时用了 --omit=optional / --no-optional，可选依赖被跳过了。\n" +
        `重新安装：npm install -g ${pkg.name}`,
    );
    process.exit(1);
  }
}

launch(bin, process.argv.slice(2), {
  NATIVE_DEMO_LAUNCHER: "node-shim",
  NATIVE_DEMO_MANAGED_BY: "npm",
});
