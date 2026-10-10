#!/usr/bin/env bash
# 本地端到端测试：用 verdaccio 模拟 npm 仓库、用本地 HTTP 服务模拟 GitHub Release，
# 验证三种分发模式的安装、退出码透传、信号转发和几种失败场景。只在 Linux / macOS 上运行。
# 先构建当前平台的产物并组装 npm 包，命令见 README 的「本地测试」或 .github/workflows/ci.yml。
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCOPE="$(node -p "require('$ROOT/dist/npm/rust-shim/package.json').name.split('/')[0]")"
VERSION="$(node -p "require('$ROOT/dist/npm/rust-shim/package.json').version")"
TMP="$(mktemp -d)"
REG_PORT=4873
HTTP_PORT=8765
REG="http://127.0.0.1:$REG_PORT"
FAILED=0

cleanup() {
  [ -n "${REG_PID:-}" ] && kill "$REG_PID" 2>/dev/null
  for port in "$HTTP_PORT" 8766; do
    lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null
  done
  if [ -n "${KEEP:-}" ]; then echo "保留现场：$TMP"; else rm -rf "$TMP"; fi
}
trap cleanup EXIT

pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; FAILED=1; }
expect_eq() { [ "$2" = "$3" ] && pass "$1" || fail "$1（期望 $3，实际 $2）"; }
expect_has() { case "$2" in *"$3"*) pass "$1" ;; *) fail "$1（输出里没有「$3」）：$2" ;; esac; }

# --- 本地 npm 仓库 ---
cat > "$TMP/verdaccio.yaml" <<EOF
storage: $TMP/storage
auth:
  htpasswd:
    file: $TMP/htpasswd
packages:
  '@*/*':
    access: \$all
    publish: \$authenticated
log: { type: stdout, format: pretty, level: error }
EOF
for port in "$REG_PORT" "$HTTP_PORT" 8766; do
  if lsof -ti "tcp:$port" -sTCP:LISTEN >/dev/null 2>&1; then echo "端口 $port 已被占用"; exit 1; fi
done
# 先装再运行：直接拿到 verdaccio 的 PID，也避免 npx 现下载拖慢启动
npm install --prefix "$TMP/verdaccio" verdaccio@6 --no-audit --no-fund --silent >/dev/null 2>&1
"$TMP/verdaccio/node_modules/.bin/verdaccio" --config "$TMP/verdaccio.yaml" --listen "$REG_PORT" >"$TMP/verdaccio.log" 2>&1 &
REG_PID=$!
for _ in $(seq 120); do curl -s "$REG/-/ping" >/dev/null && break; sleep 1; done
curl -s "$REG/-/ping" >/dev/null || { echo "verdaccio 没有启动："; cat "$TMP/verdaccio.log"; exit 1; }

TOKEN="$(curl -s -X PUT "$REG/-/user/org.couchdb.user:demo" -H 'content-type: application/json' \
  -d '{"name":"demo","password":"demo-pass"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')"
export npm_config_registry="$REG"
export npm_config_cache="$TMP/npm-cache"
export npm_config_userconfig="$TMP/npmrc"
echo "//127.0.0.1:$REG_PORT/:_authToken=$TOKEN" > "$TMP/npmrc"

# 平台子包必须先于主包发布
for dir in "$ROOT"/dist/npm/rust-*-* "$ROOT"/dist/npm/rust-shim "$ROOT"/dist/npm/rust-direct "$ROOT"/dist/npm/go-download; do
  (cd "$dir" && npm publish --silent >/dev/null) || { echo "发布 $dir 失败"; exit 1; }
done

# --- 模拟 GitHub Release ---
cp -r "$ROOT/dist/go" "$TMP/release"
python3 -m http.server "$HTTP_PORT" --directory "$TMP/release" >/dev/null 2>&1 &
sleep 1
export NATIVE_DEMO_DOWNLOAD_BASE="http://127.0.0.1:$HTTP_PORT"

install_pkg() { # prefix 包名 [npm 参数...]
  local prefix="$1" pkg="$2"; shift 2
  npm install -g --prefix "$prefix" "$pkg" "$@" >"$prefix.log" 2>&1
}

# 后台启动 sleep，向「我们启动的那个进程」发 SIGTERM，返回退出码。
signal_test() { # 命令
  "$1" sleep 30 >"$TMP/sig.out" 2>&1 &
  local pid=$!
  sleep 1
  SIG_COMM="$(ps -o comm= -p "$pid" | tr -d ' ')"
  kill -TERM "$pid"
  wait "$pid"
  SIG_RC=$?
}

common_checks() { # 命令
  local cmd="$1"
  expect_has "version 输出包版本" "$("$cmd" version 2>&1)" "$VERSION"
  "$cmd" exit 7 >/dev/null 2>&1
  expect_eq "退出码透传（exit 7）" "$?" "7"
  signal_test "$cmd"
  expect_eq "SIGTERM 后退出码为 143" "$SIG_RC" "143"
}

echo "== 1. 下载型（Go）"
P="$TMP/p1"
install_pkg "$P" "$SCOPE/native-demo-go"
expect_eq "postinstall 已下载二进制" "$(test -x "$P/lib/node_modules/$SCOPE/native-demo-go/bin/native-demo-go" && echo yes)" "yes"
expect_has "经过 Node 外壳" "$("$P/bin/native-demo-go" info)" 'NATIVE_DEMO_LAUNCHER: "node-shim"'
common_checks "$P/bin/native-demo-go"
expect_has "前台进程是 node" "$SIG_COMM" "node"
expect_has "Go 程序收到了转发的 SIGTERM" "$(cat "$TMP/sig.out")" "received terminated"

echo "== 2. 下载型 + --ignore-scripts：首次运行时补装"
P="$TMP/p2"
install_pkg "$P" "$SCOPE/native-demo-go" --ignore-scripts
expect_eq "安装后还没有二进制" "$(test -e "$P/lib/node_modules/$SCOPE/native-demo-go/bin/native-demo-go" && echo yes || echo no)" "no"
expect_has "首次运行自动下载并执行" "$("$P/bin/native-demo-go" version 2>&1)" "native-demo-go $VERSION"

echo "== 3. 下载型 + 被篡改的压缩包：校验失败"
mkdir -p "$TMP/evil" && cp "$TMP/release"/* "$TMP/evil/"
key="$(node -p 'process.platform==="darwin"?"darwin":"linux"')-$(node -p '({x64:"amd64",arm64:"arm64"})[process.arch]')"
echo "tampered" >> "$TMP/evil/native-demo-go-$VERSION-$key.tar.gz"
python3 -m http.server 8766 --directory "$TMP/evil" >/dev/null 2>&1 &
EVIL_PID=$!
sleep 1
P="$TMP/p3"
NATIVE_DEMO_DOWNLOAD_BASE="http://127.0.0.1:8766" install_pkg "$P" "$SCOPE/native-demo-go"
expect_eq "npm install 失败" "$?" "1"
expect_has "报告校验失败" "$(cat "$P.log")" "[SECURITY]"
kill "$EVIL_PID" 2>/dev/null

echo "== 4. 子包型（Rust + Node 启动器）"
P="$TMP/p4"
install_pkg "$P" "$SCOPE/native-demo-rs"
# 全局安装时子包嵌套在主包的 node_modules 下，用 find 统计
expect_eq "只装了当前平台的子包" "$(find "$P" -path '*native-demo-rs-*' -name package.json | wc -l | tr -d ' ')" "1"
expect_has "经过 Node 外壳" "$("$P/bin/native-demo-rs" info)" 'NATIVE_DEMO_LAUNCHER: "node-shim"'
common_checks "$P/bin/native-demo-rs"
expect_has "前台进程是 node" "$SIG_COMM" "node"

echo "== 5. 子包型 + --omit=optional：给出可操作的提示"
# npm 全局安装（-g）会忽略 --omit=optional，所以这里装到一个普通项目里。
P="$TMP/p5"
mkdir -p "$P" && echo '{"name":"p5","private":true}' > "$P/package.json"
(cd "$P" && npm install "$SCOPE/native-demo-rs" --omit=optional >"$P.log" 2>&1)
out="$("$P/node_modules/.bin/native-demo-rs" version 2>&1)"; rc=$?
expect_eq "退出码为 1" "$rc" "1"
expect_has "提示缺少平台子包" "$out" "找不到平台子包"

echo "== 6. 子包 + 替换占位文件（运行时不经过 Node）"
P="$TMP/p6"
install_pkg "$P" "$SCOPE/native-demo-rs-direct"
expect_has "没有经过 Node 外壳" "$("$P/bin/native-demo-rs-direct" info)" 'NATIVE_DEMO_LAUNCHER: ""'
common_checks "$P/bin/native-demo-rs-direct"
expect_has "前台进程就是原生二进制" "$SIG_COMM" "native-demo-rs"
expect_eq "和平台子包是硬链接（同一个 inode）" \
  "$(ls -i "$P/lib/node_modules/$SCOPE/native-demo-rs-direct/bin/native-demo-rs-direct.exe" | awk '{print $1}')" \
  "$(ls -i "$(find "$P" -path '*native-demo-rs-*-*/bin/native-demo-rs' -type f)" | awk '{print $1}')"

echo "== 7. 替换占位文件 + --ignore-scripts：占位脚本给出提示"
P="$TMP/p7"
install_pkg "$P" "$SCOPE/native-demo-rs-direct" --ignore-scripts
out="$("$P/bin/native-demo-rs-direct" version 2>&1)"; rc=$?
expect_eq "退出码为 1" "$rc" "1"
expect_has "提示原生二进制没有安装" "$out" "原生二进制没有安装"

echo
[ "$FAILED" = 0 ] && echo "全部通过" || { echo "有失败的检查"; exit 1; }
