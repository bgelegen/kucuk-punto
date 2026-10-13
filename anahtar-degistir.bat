@echo off
setlocal
cd /d "%~dp0"
title Kucuk Punto - API anahtarini degistir
echo.
echo   Kayitli Gemini anahtari siliniyor...
del .env >nul 2>nul
echo   Yeni anahtari yapistirin (sag tik) ve Enter'a basin. Ekranda gorunmez.
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\anahtar.ps1
if errorlevel 1 goto hata
echo.
echo   Tamam. Simdi calistir dosyasina cift tiklayin.
pause
exit /b 0
:hata
echo   Anahtar kaydedilemedi. Bu dosyayi tekrar acip deneyin.
pause
exit /b 1
