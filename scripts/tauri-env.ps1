# CursorQ — Tauri 开发环境（PowerShell 里 source 或点右键运行）
$CargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
$VsVcVars = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\18\BuildTools\VC\Auxiliary\Build\vcvars64.bat"

if (Test-Path $CargoBin) {
  $env:Path = "$CargoBin;$env:Path"
}

if (Test-Path $VsVcVars) {
  cmd /c "`"$VsVcVars`" >nul 2>&1 && set" | ForEach-Object {
    if ($_ -match '^([^=]+)=(.*)$') {
      [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process')
    }
  }
}

Write-Host "rustup: $(rustup show active-toolchain 2>$null)"
Write-Host "link:   $(where.exe link 2>$null | Select-Object -First 1)"
