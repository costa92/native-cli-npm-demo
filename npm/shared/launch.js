// 启动器的核心：拉起原生二进制，透传参数、标准输入输出、信号和退出状态。
const { spawn } = require("child_process");

function launch(bin, args, extraEnv) {
  // 用异步 spawn 而不是 spawnSync：Node 的事件循环不被阻塞，才能接收并转发信号。
  const child = spawn(bin, args, {
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
  });

  child.on("error", (err) => {
    console.error(`无法启动 ${bin}：${err.message}`);
    process.exit(1);
  });

  // 外部只给 Node 父进程发 SIGTERM 时，子进程收不到，必须手动转发。
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(sig, () => {
      if (child.exitCode === null && child.signalCode === null) child.kill(sig);
    });
  }

  child.on("exit", (code, signal) => {
    if (signal) {
      // 子进程被信号结束：父进程用同一个信号结束自己，调用方看到的退出状态（128+N）才一致。
      process.removeAllListeners(signal);
      try {
        process.kill(process.pid, signal);
        return;
      } catch {
        // Windows 不支持向自身发送大多数信号，退回普通退出码。
      }
    }
    process.exit(code ?? 1);
  });
}

module.exports = { launch };
