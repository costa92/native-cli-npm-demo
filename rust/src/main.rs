//! native-demo-rs：用来演示「Rust 写、npm 发」的最小 CLI，只依赖标准库。
use std::{env, process, thread, time::Duration};

// 发布时由 CI 通过 NATIVE_DEMO_VERSION 注入，和 npm 包版本保持一致。
const VERSION: &str = match option_env!("NATIVE_DEMO_VERSION") {
    Some(v) => v,
    None => env!("CARGO_PKG_VERSION"),
};

fn main() {
    let args: Vec<String> = env::args().collect();
    let arg = |i: usize, def: &str| args.get(i).cloned().unwrap_or_else(|| def.to_string());

    match args.get(1).map(String::as_str) {
        Some("version") => println!(
            "native-demo-rs {} ({}/{})",
            VERSION,
            env::consts::OS,
            env::consts::ARCH
        ),
        Some("info") => info(),
        Some("exit") => match arg(2, "0").parse::<i32>() {
            Ok(code) => process::exit(code),
            Err(_) => fail("exit 需要一个整数参数"),
        },
        // 标准库没有信号处理：收到 SIGTERM 时进程直接被信号结束，
        // 正好用来验证外壳能否把「被信号杀死」原样反映给调用方。
        Some("sleep") => match arg(2, "30").parse::<u64>() {
            Ok(secs) => {
                println!("sleeping {}s, pid {}", secs, process::id());
                thread::sleep(Duration::from_secs(secs));
                println!("done");
            }
            Err(_) => fail("sleep 需要一个整数参数"),
        },
        _ => fail("用法: native-demo-rs <version|info|exit N|sleep 秒数>"),
    }
}

/// 打印启动链路上的关键信息，用来观察是被 Node 外壳拉起，还是被直接执行。
fn info() {
    let exe = env::current_exe().map(|p| p.display().to_string()).unwrap_or_default();
    let var = |k: &str| env::var(k).unwrap_or_default();
    println!("executable: {}", exe);
    println!("pid: {}", process::id());
    println!("NATIVE_DEMO_LAUNCHER: {:?}", var("NATIVE_DEMO_LAUNCHER"));
    println!("NATIVE_DEMO_MANAGED_BY: {:?}", var("NATIVE_DEMO_MANAGED_BY"));
}

fn fail(msg: &str) -> ! {
    eprintln!("{}", msg);
    process::exit(2);
}
