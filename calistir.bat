@echo off
setlocal
cd /d "%~dp0"
title Kucuk Punto - degerlendirme ve demo videosu
echo.
echo   KUCUK PUNTO - Gemini degerlendirmesi ve Cypress demo videosu
echo   ------------------------------------------------------------
echo.

where node >nul 2>nul
if not errorlevel 1 goto node_ok
echo   [1/4] Node.js bulunamadi, simdi kuruluyor.
echo         Windows izin sorarsa "Evet" deyin.
where winget >nul 2>nul
if errorlevel 1 (
  echo   winget yok. Acilan sayfadan "LTS" surumunu indirip kurun, sonra bu dosyayi tekrar acin.
  start https://nodejs.org
  pause
  exit /b 1
)
winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
echo.
echo   Node.js kuruldu. Bu pencereyi kapatip calistir.bat dosyasina TEKRAR cift tiklayin.
pause
exit /b 0

:node_ok
echo   [1/4] Node.js hazir.

if exist node_modules\cypress goto deps_ok
echo   [2/4] Gerekli paketler indiriliyor. Ilk seferde birkac dakika surer...
call npm install
if errorlevel 1 goto hata
:deps_ok
echo   [2/4] Paketler hazir.

if exist .env goto key_ok
echo.
echo   [3/4] Gemini API anahtarinizi yapistirin (sag tik) ve Enter'a basin.
echo         Guvenlik icin anahtar ekranda gorunmez.
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\anahtar.ps1
if errorlevel 1 goto hata
:key_ok
echo   [3/4] Anahtar hazir (.env dosyasinda, GitHub'a gitmez).

echo.
echo   [4/4] Gemini 6 sozlesmeyi ve gizli talimat sayfasini inceliyor. 5-10 dakika surebilir...
call npm run eval:gemini
if errorlevel 1 goto hata
echo.
echo   Demo videosu cekiliyor (Cypress). 1-2 dakika...
call npm run demo
if errorlevel 1 goto hata

echo.
echo   ============================================================
echo    BITTI. Claude'a sadece "bitti" yazin, gerisini o halleder.
echo   ============================================================
echo.
pause
exit /b 0

:hata
echo.
echo   Bir hata oldu. Bu pencerenin ekran goruntusunu Claude'a gonderin.
echo   (Anahtar yanlissa: .env dosyasini silip bu dosyayi tekrar acin.)
pause
exit /b 1
