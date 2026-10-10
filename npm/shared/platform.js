// Node 的平台标识 → Go 的 GOOS-GOARCH、Rust 的 target triple。
// 三套命名的映射集中在这一张表里：写错一项，那个平台的用户就装不上。
// Linux 的 Rust 产物统一用 musl 静态链接，省掉 glibc / musl 的判断。
const PLATFORMS = {
  "linux-x64": { go: "linux-amd64", rust: "x86_64-unknown-linux-musl" },
  "linux-arm64": { go: "linux-arm64", rust: "aarch64-unknown-linux-musl" },
  "darwin-x64": { go: "darwin-amd64", rust: "x86_64-apple-darwin" },
  "darwin-arm64": { go: "darwin-arm64", rust: "aarch64-apple-darwin" },
  "win32-x64": { go: "windows-amd64", rust: "x86_64-pc-windows-msvc" },
  "win32-arm64": { go: "windows-arm64", rust: "aarch64-pc-windows-msvc" },
};

function currentKey() {
  return `${process.platform}-${process.arch}`;
}

function exeName(name, platform = process.platform) {
  return platform === "win32" ? `${name}.exe` : name;
}

function unsupported(key) {
  return (
    `不支持的平台：${key}。` +
    `支持的平台：${Object.keys(PLATFORMS).join(", ")}`
  );
}

module.exports = { PLATFORMS, currentKey, exeName, unsupported };
