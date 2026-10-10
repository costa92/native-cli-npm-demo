#!/usr/bin/env node
// 子包 + 替换占位文件（参考 @anthropic-ai/claude-code、bun）：
// bin 字段直接指向 bin/native-demo-rs-direct.exe，发布时它只是一个报错用的占位脚本。
// postinstall 把平台子包里的原生二进制放到这个位置，之后执行命令时不再经过 Node。
const fs = require("fs");
const path = require("path");
const { PLATFORMS, currentKey, exeName, unsupported } = require("./lib/platform");

const pkg = require("./package.json");
// bin 字段只能写一个路径，Windows 上它必须以 .exe 结尾，所以各平台统一用这个文件名。
const dest = path.join(__dirname, "bin", "native-demo-rs-direct.exe");

function placeBinary(src) {
  // 优先硬链接：不额外占磁盘，也是瞬间完成；跨文件系统或没有权限时退回复制。
  fs.rmSync(dest, { force: true });
  try {
    fs.linkSync(src, dest);
  } catch {
    fs.copyFileSync(src, dest);
  }
  fs.chmodSync(dest, 0o755);
}

const key = currentKey();
if (!PLATFORMS[key]) {
  console.error(unsupported(key));
  process.exit(0);
}

const subpackage = `${pkg.name.replace(/-direct$/, "")}-${key}`;
let src;
try {
  src = require.resolve(`${subpackage}/bin/${exeName("native-demo-rs")}`);
} catch {
  // 子包缺失时保留占位脚本，不让整个 npm install 失败；运行时它会给出修复提示。
  console.error(`没有找到平台子包 ${subpackage}（可能用了 --omit=optional），保留占位文件。`);
  process.exit(0);
}

placeBinary(src);
console.log(`${pkg.name}：已把 ${subpackage} 的原生二进制放到 bin/`);
