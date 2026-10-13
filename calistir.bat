@echo off
setlocal
cd /d "%~dp0"
title Kucuk Punto - degerlendirme ve demo videosu
echo.
echo   KUCUK PUNTO - Gemini degerlendirmesi ve Cypress demo videosu
echo   ------------------------------------------------------------
echo   Not: Bu pencereye SAG TIKLAMAK yapistirma yapar. Anahtari
echo   girdikten sonra pencereye sag tiklamayin.
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
echo   Node.js kuruldu. Bu pencereyi kapatip calistir dosyasina TEKRAR cift tiklayin.
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

set TRIED_KEY=0
:key
if exist .env goto key_ok
echo.
echo   [3/4] Gemini API anahtarinizi yapistirin (sag tik) ve Enter'a basin.
echo         Guvenlik icin anahtar ekranda gorunmez.
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\anahtar.ps1
if errorlevel 1 goto hata
:key_ok
echo   [3/4] Anahtar hazir (.env dosyasinda, GitHub'a gitmez).

echo.
echo   [4/4] Model kontrolu, 6 sozlesme, gizli talimat testi ve demo videosu.
echo         Ucretsiz kota icin istekler arasinda bekleniyor; 10-15 dakika surebilir...
node scripts\run-all.js
if errorlevel 5 goto bitti_eksik
if errorlevel 4 goto kota
if errorlevel 3 goto anahtar_gecersiz
if errorlevel 1 goto hata

echo.
echo   ============================================================
echo    BITTI. Claude'a sadece "bitti" yazin, gerisini o halleder.
echo   ============================================================
echo.
pause
exit /b 0

:anahtar_gecersiz
del .env >nul 2>nul
if "%TRIED_KEY%"=="1" goto hata
set TRIED_KEY=1
echo.
echo   Anahtar gecersiz. Yeni anahtari girin:
goto key

:kota
echo.
echo   Gemini su an yanit vermiyor (yogunluk veya gunluk ucretsiz kota).
echo   Birkac saat sonra bu dosyayi tekrar acin; kaldigi yerden devam eder.
pause
exit /b 1

:bitti_eksik
echo.
echo   Bazi adimlar tamamlanamadi. Yine de Claude'a "bitti" yazin;
echo   sonuclara bakip ne yapilacagini soyleyecek.
pause
exit /b 1

:hata
echo.
echo   Bir hata oldu. Bu pencerenin ekran goruntusunu Claude'a gonderin.
pause
exit /b 1
