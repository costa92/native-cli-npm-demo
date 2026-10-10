// native-demo-go：用来演示「Go 写、npm 发」的最小 CLI。
package main

import (
	"fmt"
	"os"
	"os/signal"
	"runtime"
	"strconv"
	"syscall"
	"time"
)

// 发布时用 -ldflags "-X main.version=..." 注入，和 npm 包版本保持一致。
var version = "dev"

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	switch os.Args[1] {
	case "version":
		fmt.Printf("native-demo-go %s (%s, %s/%s)\n", version, runtime.Version(), runtime.GOOS, runtime.GOARCH)
	case "info":
		info()
	case "exit":
		code, err := strconv.Atoi(arg(2, "0"))
		if err != nil {
			fmt.Fprintln(os.Stderr, "exit 需要一个整数参数")
			os.Exit(2)
		}
		os.Exit(code)
	case "sleep":
		sleep(arg(2, "30"))
	default:
		usage()
		os.Exit(2)
	}
}

func arg(i int, def string) string {
	if len(os.Args) > i {
		return os.Args[i]
	}
	return def
}

func usage() {
	fmt.Fprintln(os.Stderr, "用法: native-demo-go <version|info|exit N|sleep 秒数>")
}

// info 打印启动链路上的关键信息，用来观察是被 Node 外壳拉起，还是被直接执行。
func info() {
	exe, _ := os.Executable()
	fmt.Printf("executable: %s\n", exe)
	fmt.Printf("pid: %d, ppid: %d\n", os.Getpid(), os.Getppid())
	fmt.Printf("NATIVE_DEMO_LAUNCHER: %q\n", os.Getenv("NATIVE_DEMO_LAUNCHER"))
	fmt.Printf("NATIVE_DEMO_MANAGED_BY: %q\n", os.Getenv("NATIVE_DEMO_MANAGED_BY"))
}

// sleep 用来验证信号能否从外壳传到二进制：收到 SIGTERM/SIGINT 时打印后以 128+N 退出。
func sleep(s string) {
	secs, err := strconv.Atoi(s)
	if err != nil {
		fmt.Fprintln(os.Stderr, "sleep 需要一个整数参数")
		os.Exit(2)
	}
	ch := make(chan os.Signal, 1)
	signal.Notify(ch, syscall.SIGTERM, syscall.SIGINT)
	fmt.Printf("sleeping %ds, pid %d\n", secs, os.Getpid())
	select {
	case sig := <-ch:
		fmt.Printf("received %s\n", sig)
		if sig == syscall.SIGINT {
			os.Exit(130)
		}
		os.Exit(143)
	case <-time.After(time.Duration(secs) * time.Second):
		fmt.Println("done")
	}
}
