@echo off
cd /d "%~dp0.."
call "%~dp0tauri-env.cmd" || exit /b 1
echo [cursorq] Starting Tauri dev (first run may compile Rust 5-15 min, please wait)...
call npm run build:core
if errorlevel 1 (
  echo [cursorq] build:core failed
  exit /b 1
)
cd /d "%~dp0..\apps\tauri"
echo [cursorq] Launching tauri dev...
call npx tauri dev
if errorlevel 1 (
  echo [cursorq] tauri dev failed
  exit /b 1
)
