fn main() {
    // 测试 rustc_version 是否能正常工作
    match rustc_version::version() {
        Ok(v) => println!("rustc version: {}", v),
        Err(e) => println!("rustc version error: {:?}", e),
    }
    
    // 继续正常的 tauri build
    tauri_build::build()
}
