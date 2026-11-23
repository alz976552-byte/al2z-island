@echo off
chcp 65001 >nul
title AL2Z Island - Launcher
cd /d "%~dp0"

echo.
echo ================================
echo   AL2Z Island
echo   Folder: %CD%
echo ================================
echo.

rem Снимаем метку "скачано из интернета" со всех файлов папки
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -LiteralPath '%CD%' -Recurse -File -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue" >nul 2>&1

set "EXE=Al2z Island.exe"

if not exist "%EXE%" (
    echo [ERROR] Не найден файл: "%EXE%"
    echo.
    echo Положите run.bat в ту же папку, где лежит Al2z Island.exe
    echo и отправьте другу ВСЮ папку, а не только exe.
    echo.
    pause
    exit /b 1
)

echo Запуск %EXE% ...
echo.
start "" "%EXE%"

echo Если игра не появилась или сразу закрылась:
echo   1) откройте eventvwr.msc -^> Windows Logs -^> Application
echo   2) скопируйте последнюю ошибку уровня Error
echo.
pause
exit /b 0
