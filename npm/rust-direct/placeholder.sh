echo "native-demo-rs-direct: 原生二进制没有安装。" >&2
echo "原因：postinstall 没有执行（--ignore-scripts、pnpm 默认配置），或平台子包被跳过（--omit=optional）。" >&2
echo "修复：去掉上述参数重新安装，例如 npm install -g <包名>。" >&2
exit 1
# 发布到 npm 时，bin/native-demo-rs-direct.exe 就是这个脚本；postinstall 正常执行后它会被原生二进制替换。
# 故意不写 shebang：Windows 上 npm 生成命令包装时会读取 shebang，写了 #!/bin/sh，
# 包装就会用 sh 去调用它，替换成 .exe 之后反而无法运行。没有 shebang 时 Unix shell 会按 sh 脚本执行它。
