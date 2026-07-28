fn main() {
    if let Err(error) = yuanheng_switch_lib::run_core_cli() {
        eprintln!("yuanheng-core: {error}");
        std::process::exit(1);
    }
}
