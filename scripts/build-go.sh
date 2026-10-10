#!/usr/bin/env bash
# 交叉编译 Go 版本的 6 个平台，打成 GoReleaser 风格的压缩包，并生成 checksums.txt。
# 用法：scripts/build-go.sh 0.1.0
set -euo pipefail

VERSION="${1:?用法: build-go.sh <version>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/dist/go"
NAME=native-demo-go
rm -rf "$OUT" && mkdir -p "$OUT"

for target in linux-amd64 linux-arm64 darwin-amd64 darwin-arm64 windows-amd64 windows-arm64; do
  goos="${target%-*}"
  goarch="${target#*-}"
  exe="$NAME"
  [ "$goos" = windows ] && exe="$NAME.exe"

  work="$(mktemp -d)"
  # CGO_ENABLED=0：纯静态链接，不依赖目标机器的 libc，Linux 只需要一个版本。
  (cd "$ROOT/go" && CGO_ENABLED=0 GOOS="$goos" GOARCH="$goarch" \
    go build -trimpath -ldflags "-s -w -X main.version=$VERSION" -o "$work/$exe" .)

  archive="$NAME-$VERSION-$target"
  if [ "$goos" = windows ]; then
    (cd "$work" && zip -q "$OUT/$archive.zip" "$exe")
  else
    tar -C "$work" -czf "$OUT/$archive.tar.gz" "$exe"
  fi
  rm -rf "$work"
  echo "built $archive"
done

(cd "$OUT" && sha256sum "$NAME"-* > checksums.txt)
cat "$OUT/checksums.txt"
