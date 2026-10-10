# native-cli-npm-demo

用 npm 分发 Go / Rust 原生 CLI 的最小可运行示例，配套文章：[Go、Rust 写的 CLI 为什么用 npm 分发：拆开飞书 lark-cli 和 Codex 看整套设计](https://costalong.com/2026/10/10/go-cli-npm-distribution/)。

同一个小 CLI 分别用 Go 和 Rust 实现，用三种方式发布到 npm：

| npm 包 | 实现 | 分发方式 | 参考的真实项目 |
| --- | --- | --- | --- |
| `@costa92/native-demo-go` | Go | **下载型**：postinstall 从 GitHub Release 下载并校验 | `@larksuite/cli`、`@go-task/cli` |
| `@costa92/native-demo-rs` | Rust | **子包型**：平台子包 + Node 启动器 | `@biomejs/biome`、`esbuild`、`@openai/codex` |
| `@costa92/native-demo-rs-direct` | Rust | **子包 + 替换占位文件**：运行时不经过 Node | `@anthropic-ai/claude-code`、`bun` |
| `@costa92/native-demo-rs-<平台>` | Rust | 平台子包，上面两个包共用 | — |

## 试一下

```bash
npx @costa92/native-demo-go version
npx @costa92/native-demo-rs version

npm install -g @costa92/native-demo-rs-direct
native-demo-rs-direct info     # NATIVE_DEMO_LAUNCHER 为空：没有经过 Node
```

CLI 只有 4 个子命令，用来观察分发层的行为：

| 子命令 | 用途 |
| --- | --- |
| `version` | 版本、平台，确认装的是哪个平台的二进制 |
| `info` | 可执行文件路径、是否经过 Node 启动器 |
| `exit N` | 以退出码 N 结束，验证退出码透传 |
| `sleep 秒数` | 等待信号，验证 SIGTERM 能否从启动器传到二进制 |

## 目录结构

```text
go/                     Go 版 CLI
rust/                   Rust 版 CLI（只依赖标准库）
npm/
  shared/platform.js    Node / Go / Rust 三套平台命名的映射表
  shared/launch.js      启动器：透传参数、stdio、信号和退出状态
  go-download/          下载型：install.js（下载 + SHA-256 校验）、run.js
  rust-shim/            子包型：launcher.js（require.resolve 找到子包里的二进制）
  rust-direct/          替换占位文件：install.js（硬链接替换）、placeholder.sh
scripts/
  build-go.sh           一台机器交叉编译 Go 的 6 个平台，生成 checksums.txt
  build-rust.sh         编译 Rust 的一个平台（CI 里按平台分别执行）
  pack-npm.mjs          把构建产物组装成 npm 包，输出到 dist/npm/
test/e2e.sh             本地端到端测试
.github/workflows/
  ci.yml                Linux / macOS 上跑端到端测试
  release.yml           推 tag 后：全平台构建 → GitHub Release → npm 发布 → 三系统安装验证
```

## 三种模式的关键代码

**下载型**（`npm/go-download/install.js`）：npm 包里只有脚本和 `checksums.txt`。安装时按平台拼出 Release 文件名，依次尝试下载源，用随包发布的哈希校验后解压。`run.js` 发现二进制不存在（`--ignore-scripts`、`npx`）时会先补装。

**子包型**（`npm/rust-shim/launcher.js`）：每个平台一个 npm 子包，用 `os` / `cpu` 字段声明适用平台，主包把它们列为 `optionalDependencies`，包管理器只下载匹配的那一个。启动器用 `require.resolve` 找到子包里的二进制。

**替换占位文件**（`npm/rust-direct/install.js`）：`bin` 直接指向 `bin/native-demo-rs-direct.exe`，发布时它只是一个报错脚本。postinstall 把平台子包里的二进制硬链接到这个位置，之后执行命令不再启动 Node。

## 本地测试

需要 Go、Rust、Node 18+、Python 3（Linux 或 macOS）。

```bash
# Linux x64（macOS Apple Silicon 换成 aarch64-apple-darwin darwin-arm64）
rustup target add x86_64-unknown-linux-musl
scripts/build-go.sh 0.1.0
scripts/build-rust.sh 0.1.0 x86_64-unknown-linux-musl linux-x64
node scripts/pack-npm.mjs --scope @demo --version 0.1.0
test/e2e.sh
```

`e2e.sh` 用 verdaccio 模拟 npm 仓库、用本地 HTTP 服务模拟 GitHub Release，不会访问公网仓库，覆盖 7 个场景：

1. 下载型正常安装：退出码透传、SIGTERM 转发
2. 下载型 + `--ignore-scripts`：首次运行时自动补装
3. 下载型 + 被篡改的压缩包：校验失败，安装中止
4. 子包型：只装当前平台的子包，退出码和信号正确
5. 子包型 + `--omit=optional`：启动器给出修复提示
6. 替换占位文件：运行时进程就是原生二进制，与子包文件是同一个 inode
7. 替换占位文件 + `--ignore-scripts`：占位脚本给出修复提示

## 发布

推送 `v*` tag 触发 `release.yml`：

```bash
git tag v0.1.0 && git push origin v0.1.0
```

需要在仓库的 Actions secrets 里配置 `NPM_TOKEN`（npm 的 Granular Access Token，有发布权限）。包的 scope 默认是 `@costa92`，可以用仓库变量 `NPM_SCOPE` 覆盖。

## License

MIT
