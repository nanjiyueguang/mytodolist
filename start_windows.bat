@echo off
chcp 65001 >nul
title Todo 任务管理系统

echo ========================================
echo   Todo 任务管理系统 - Windows 启动器
echo ========================================
echo.

REM 检查 Python 是否安装
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Python，请先安装 Python
    echo 下载地址: https://www.python.org/downloads/
    echo 安装时请勾选 "Add Python to PATH"
    pause
    exit /b 1
)

echo [1/3] 检查 Python... OK
echo [2/3] 安装依赖...

REM 安装依赖（静默模式）
pip install -r requirements.txt -q

echo [3/3] 启动服务...
echo.
echo ========================================
echo   服务已启动！
echo   请在浏览器打开: http://localhost:5050
echo   按 Ctrl+C 停止服务
echo ========================================
echo.

REM 自动打开浏览器
start http://localhost:5050

REM 启动 Flask 应用
python app.py

pause
