use std::fs::OpenOptions;
use std::io::Write;

use chrono::Local;

use crate::paths;

pub fn append(line: &str) {
    let dir = paths::logs_dir();
    let _ = std::fs::create_dir_all(&dir);
    let path = dir.join("cursorq.log");
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(f, "[{}] {}", Local::now().format("%Y-%m-%d %H:%M:%S"), line);
    }
}
