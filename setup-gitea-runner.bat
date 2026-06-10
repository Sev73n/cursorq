@echo off
chcp 65001 >nul
echo ==========================================
echo  Gitea Runner 安装脚本
echo ==========================================
echo.

set RUNNER_DIR=C:\gitea-runner
set GITEA_URL=http://git.73oc.local
set RUNNER_TOKEN=DIs5NrmmwZeSE5OO5Rw1aiIODffP0bsYI4TWxRZw

echo [1/4] 创建 runner 目录...
if not exist "%RUNNER_DIR%" mkdir "%RUNNER_DIR%"
cd /d "%RUNNER_DIR%"

echo [2/4] 下载 act_runner...
if not exist "act_runner.exe" (
    powershell -Command "Invoke-WebRequest -Uri 'https://dl.gitea.com/act_runner/latest/act_runner-windows-amd64.exe' -OutFile 'act_runner.exe'"
    if errorlevel 1 (
        echo 下载失败，请手动下载并放到 %RUNNER_DIR%\act_runner.exe
        pause
        exit /b 1
    )
    echo 下载完成
) else (
    echo act_runner.exe 已存在，跳过下载
)

echo [3/4] 注册 runner...
act_runner.exe register ^
    --instance %GITEA_URL% ^
    --token %RUNNER_TOKEN% ^
    --name cursorq-builder ^
    --labels "self-hosted,windows" ^
    --no-interactive

if errorlevel 1 (
    echo 注册失败！
    pause
    exit /b 1
)

echo [4/4] 启动 runner...
echo.
echo ==========================================
echo  注册成功！
echo ==========================================
echo.
echo 启动命令:
echo   cd /d %RUNNER_DIR%
echo   act_runner.exe daemon
echo.
echo 或者创建 Windows 服务（需要管理员权限）:
echo   sc create GiteaRunner binPath= "%RUNNER_DIR%\act_runner.exe daemon"
echo.
pause
