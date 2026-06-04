# Add %USERPROFILE%\.cargo\bin to Windows User PATH; remove broken entries.
$cargoBin = Join-Path $env:USERPROFILE '.cargo\bin'
$cargoExe = Join-Path $cargoBin 'cargo.exe'

Write-Host "[cursorq] Cargo directory: $cargoBin"

if (-not (Test-Path $cargoExe)) {
  Write-Host "[cursorq] ERROR: cargo.exe not found. Install Rust: https://rustup.rs" -ForegroundColor Red
  exit 1
}

$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($null -eq $userPath) { $userPath = '' }

$badPatterns = @(
  ':USERPROFILE\.cargo\bin',
  '%USERPROFILE%\.cargo\bin',
  '${USERPROFILE}\.cargo\bin'
)

$norm = { param($p) ($p -replace '\\$', '').ToLowerInvariant() }
$cargoNorm = & $norm $cargoBin

$parts = $userPath -split ';' | Where-Object { $_.Trim() -ne '' }
$cleaned = [System.Collections.Generic.List[string]]::new()
$seen = @{}

foreach ($p in $parts) {
  $trim = $p.Trim()
  if ($badPatterns -contains $trim) {
    Write-Host "[cursorq] Removed invalid PATH entry: $trim"
    continue
  }
  $key = & $norm $trim
  if ($seen.ContainsKey($key)) { continue }
  $seen[$key] = $true
  $cleaned.Add($trim)
}

$hasCargo = $cleaned | Where-Object { (& $norm $_) -eq $cargoNorm }
if (-not $hasCargo) {
  $cleaned.Add($cargoBin)
  Write-Host "[cursorq] Added: $cargoBin"
} else {
  Write-Host "[cursorq] Cargo path already present."
}

$newPath = ($cleaned -join ';')
[Environment]::SetEnvironmentVariable('Path', $newPath, 'User')

# Notify running apps (new terminals still need reopen in many cases)
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class NativeMethods {
  [DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Auto)]
  public static extern IntPtr SendMessageTimeout(
    IntPtr hWnd, int Msg, IntPtr wParam, string lParam,
    int fuFlags, int uTimeout, out IntPtr lpdwResult);
}
"@ -ErrorAction SilentlyContinue | Out-Null
if ([NativeMethods]) {
  $HWND_BROADCAST = [IntPtr]0xffff
  $WM_SETTINGCHANGE = 0x1a
  $null = [NativeMethods]::SendMessageTimeout(
    $HWND_BROADCAST, $WM_SETTINGCHANGE, [IntPtr]::Zero, 'Environment',
    2, 5000, [ref]([IntPtr]::Zero))
}

Write-Host "[cursorq] User PATH updated. Reopen Git Bash / Cursor terminal."
Write-Host "[cursorq] Verify: cargo -V"
