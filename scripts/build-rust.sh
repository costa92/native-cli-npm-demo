#!/usr/bin/env bash
# 编译 Rust 版本的一个平台，输出到 dist/rust/<node 平台标识>/。
# Rust 每个 target 都需要对应的工具链，CI 里按平台分别在对应的 runner 上执行。
# 用法：scripts/build-rust.sh 0.1.0 x86_64-unknown-linux-musl linux-x64
set -euo pipefail

VERSION="${1:?用法: build-rust.sh <version> <rust target> <node platform>}"
TARGET="${2:?}"
KEY="${3:?}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/dist/rust/$KEY"

(cd "$ROOT/rust" && NATIVE_DEMO_VERSION="$VERSION" cargo build --release --locked --target "$TARGET")

exe=native-demo-rs
case "$KEY" in win32-*) exe=native-demo-rs.exe ;; esac
rm -rf "$OUT" && mkdir -p "$OUT"
cp "$ROOT/rust/target/$TARGET/release/$exe" "$OUT/$exe"
echo "built $OUT/$exe"
