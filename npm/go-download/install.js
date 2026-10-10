#!/usr/bin/env node
// 下载型（参考 @larksuite/cli）：npm 包里不放二进制，postinstall 时按平台下载 GitHub Release 里的压缩包。
// 校验值随 npm 包一起发布（checksums.txt），所以不管二进制来自哪个下载源，都能发现被篡改。
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const { PLATFORMS, currentKey, exeName, unsupported } = require("./lib/platform");

const pkg = require("./package.json");
const NAME = "native-demo-go";

// 下载源按顺序尝试。环境变量可以覆盖，用于公司镜像、离线环境和本地测试。
function downloadBases() {
  const fromEnv = process.env.NATIVE_DEMO_DOWNLOAD_BASE;
  const bases = fromEnv ? fromEnv.split(",") : pkg.config.downloadBases;
  return bases.map((b) => b.trim().replace("{version}", pkg.version)).filter(Boolean);
}

function expectedSha256(archive) {
  const lines = fs.readFileSync(path.join(__dirname, "checksums.txt"), "utf8").split("\n");
  for (const line of lines) {
    const [hash, file] = line.trim().split(/\s+/);
    if (file === archive) return hash;
  }
  throw new Error(`checksums.txt 里没有 ${archive}`);
}

async function download(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

async function install() {
  const key = currentKey();
  const target = PLATFORMS[key];
  if (!target) throw new Error(unsupported(key));

  const ext = process.platform === "win32" ? ".zip" : ".tar.gz";
  const archive = `${NAME}-${pkg.version}-${target.go}${ext}`;
  const expected = expectedSha256(archive);

  let data;
  const errors = [];
  for (const base of downloadBases()) {
    const url = `${base.replace(/\/+$/, "")}/${archive}`;
    try {
      data = await download(url);
      break;
    } catch (err) {
      errors.push(`  ${url}: ${err.message}`);
    }
  }
  if (!data) throw new Error(`所有下载源都失败了：\n${errors.join("\n")}`);

  const actual = crypto.createHash("sha256").update(data).digest("hex");
  if (actual !== expected) {
    throw new Error(`[SECURITY] ${archive} 校验失败：期望 ${expected}，实际 ${actual}`);
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `${NAME}-`));
  try {
    const archivePath = path.join(tmp, archive);
    fs.writeFileSync(archivePath, data);
    // Windows 10 起自带的 tar（bsdtar）能解 zip；写全路径，避免 PATH 里 Git Bash 的 GNU tar 抢先（它解不了 zip）。
    const tar =
      process.platform === "win32"
        ? path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe")
        : "tar";
    execFileSync(tar, ["-xf", archivePath, "-C", tmp], { stdio: "ignore" });

    const binDir = path.join(__dirname, "bin");
    fs.mkdirSync(binDir, { recursive: true });
    const dest = path.join(binDir, exeName(NAME));
    fs.copyFileSync(path.join(tmp, exeName(NAME)), dest);
    fs.chmodSync(dest, 0o755);
    console.log(`${NAME} ${pkg.version} (${key}) 安装完成`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

install().catch((err) => {
  console.error(`安装 ${NAME} 失败：${err.message}`);
  console.error("网络受限时可以设置 NATIVE_DEMO_DOWNLOAD_BASE 指向可访问的镜像目录。");
  process.exit(1);
});
