@echo off
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
call "%ProgramFiles(x86)%\Microsoft Visual Studio\18\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >nul 2>&1
where link | findstr /i "Microsoft Visual Studio" >nul || (
  echo [cursorq] MSVC link not found. Install VS Build Tools with C++ workload.
  exit /b 1
)
echo [cursorq] Tauri env ready. MSVC link OK.
