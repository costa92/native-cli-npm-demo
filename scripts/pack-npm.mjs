#!/usr/bin/env node
// 把 dist/ 里的构建产物组装成可发布的 npm 包，输出到 dist/npm/。
// 用法：node scripts/pack-npm.mjs --scope @costa92 --version 0.1.0
//
// 产出的包：
//   <scope>/native-demo-go             下载型，Go 二进制在 GitHub Release
//   <scope>/native-demo-rs-<平台>       Rust 平台子包，每个只含一个二进制
//   <scope>/native-demo-rs             子包型，Node 启动器 + optionalDependencies
//   <scope>/native-demo-rs-direct      子包 + 替换占位文件，运行时不经过 Node
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const { PLATFORMS, exeName } = require(path.join(ROOT, "npm/shared/platform.js"));

const { values } = parseArgs({
  options: {
    scope: { type: "string" },
    version: { type: "string" },
  },
});
const scope = values.scope;
const version = values.version;
if (!scope?.startsWith("@") || !version) {
  console.error("用法: node scripts/pack-npm.mjs --scope @xxx --version 0.1.0");
  process.exit(1);
}

const REPO = "costa92/native-cli-npm-demo";
const OUT = path.join(ROOT, "dist/npm");
fs.rmSync(OUT, { recursive: true, force: true });

const common = {
  version,
  license: "MIT",
  homepage: `https://github.com/${REPO}#readme`,
  // npm provenance 要求 repository 和发布所在的 GitHub 仓库一致。
  repository: { type: "git", url: `git+https://github.com/${REPO}.git` },
};

function writePackage(dir, manifest, files) {
  const pkgDir = path.join(OUT, dir);
  for (const [dest, src] of Object.entries(files)) {
    const target = path.join(pkgDir, dest);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (typeof src === "string") fs.copyFileSync(src, target);
    else fs.writeFileSync(target, src.content);
    if (src.mode) fs.chmodSync(target, src.mode);
  }
  fs.writeFileSync(path.join(pkgDir, "package.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`packed ${manifest.name}@${manifest.version} -> dist/npm/${dir}`);
}

const shared = {
  "lib/platform.js": path.join(ROOT, "npm/shared/platform.js"),
  "lib/launch.js": path.join(ROOT, "npm/shared/launch.js"),
};

// 1. 下载型：Go
writePackage(
  "go-download",
  {
    name: `${scope}/native-demo-go`,
    ...common,
    description: "Download mode demo: a Go CLI fetched from GitHub Releases at install time",
    bin: { "native-demo-go": "run.js" },
    scripts: { postinstall: "node install.js" },
    config: {
      // 依次尝试；{version} 会被替换成包版本，保证 npm 包和 Release 一一对应。
      downloadBases: [`https://github.com/${REPO}/releases/download/v{version}`],
    },
    files: ["run.js", "install.js", "lib/", "checksums.txt"],
    engines: { node: ">=18" },
  },
  {
    ...shared,
    "run.js": path.join(ROOT, "npm/go-download/run.js"),
    "install.js": path.join(ROOT, "npm/go-download/install.js"),
    "checksums.txt": path.join(ROOT, "dist/go/checksums.txt"),
  },
);

// 2. Rust 平台子包：只发布实际构建出来的平台
const platformDeps = {};
for (const [key, target] of Object.entries(PLATFORMS)) {
  const [os, cpu] = key.split("-");
  const exe = exeName("native-demo-rs", os);
  const bin = path.join(ROOT, "dist/rust", key, exe);
  if (!fs.existsSync(bin)) {
    console.warn(`skip ${key}: ${path.relative(ROOT, bin)} 不存在`);
    continue;
  }
  const name = `${scope}/native-demo-rs-${key}`;
  platformDeps[name] = version;
  writePackage(
    `rust-${key}`,
    {
      name,
      ...common,
      description: `native-demo-rs binary for ${key} (${target.rust})`,
      // 包管理器据此跳过不匹配的平台，只下载这一个子包。
      os: [os],
      cpu: [cpu],
      files: ["bin/"],
      preferUnplugged: true,
    },
    { [`bin/${exe}`]: { content: fs.readFileSync(bin), mode: 0o755 } },
  );
}

// 3. 子包型：Node 启动器
writePackage(
  "rust-shim",
  {
    name: `${scope}/native-demo-rs`,
    ...common,
    description: "Subpackage mode demo: a Rust CLI shipped as per-platform optionalDependencies",
    bin: { "native-demo-rs": "launcher.js" },
    optionalDependencies: platformDeps,
    files: ["launcher.js", "lib/"],
    engines: { node: ">=18" },
  },
  { ...shared, "launcher.js": path.join(ROOT, "npm/rust-shim/launcher.js") },
);

// 4. 子包 + 替换占位文件：和子包型共用同一组平台子包，区别只在主包
writePackage(
  "rust-direct",
  {
    name: `${scope}/native-demo-rs-direct`,
    ...common,
    description: "Direct mode demo: postinstall places the native binary at the bin path, no Node at runtime",
    bin: { "native-demo-rs-direct": "bin/native-demo-rs-direct.exe" },
    scripts: { postinstall: "node install.js" },
    optionalDependencies: platformDeps,
    files: ["install.js", "lib/", "bin/"],
    engines: { node: ">=18" },
  },
  {
    "lib/platform.js": shared["lib/platform.js"],
    "install.js": path.join(ROOT, "npm/rust-direct/install.js"),
    "bin/native-demo-rs-direct.exe": {
      content: fs.readFileSync(path.join(ROOT, "npm/rust-direct/placeholder.sh")),
      mode: 0o755,
    },
  },
);
