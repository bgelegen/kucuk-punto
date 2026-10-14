@echo off
setlocal
cd /d "%~dp0"
title Kucuk Punto - canli demo icin model yanitlari
echo.
echo   KUCUK PUNTO - canli demo icin gercek model yanitlari
echo   ----------------------------------------------------
echo   3 ornek sayfayi Gemini ile bir kez analiz eder ve yanitlari kaydeder.
echo   Video cekmez, degerlendirmeyi tekrar calistirmaz.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   Node.js bulunamadi. Once calistir.bat dosyasini acin.
  pause
  exit /b 1
)

echo   [1/3] Paketler kontrol ediliyor...
call npm install --no-audit --no-fund
if errorlevel 1 goto hata

if exist .env goto key_ok
echo.
echo   [2/3] Gemini API anahtarinizi yapistirin (sag tik) ve Enter'a basin.
echo         Guvenlik icin anahtar ekranda gorunmez.
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\anahtar.ps1
if errorlevel 1 goto hata
:key_ok
echo   [2/3] Anahtar hazir (.env dosyasinda, GitHub'a gitmez).

echo.
echo   [3/3] Model seciliyor ve 3 sayfa analiz ediliyor (1 dakika)...
node scripts\run-all.js --record
if errorlevel 5 goto hata
if errorlevel 4 goto kota
if errorlevel 3 goto anahtar
if errorlevel 1 goto hata

echo.
echo   ============================================================
echo    BITTI. Yanitlar: demo\recordings
echo    Claude'a sadece "bitti" yazin, gerisini o halleder.
echo   ============================================================
echo.
pause
exit /b 0

:anahtar
echo.
echo   Anahtar gecersiz. anahtar-degistir.bat ile yeni anahtar girip tekrar deneyin.
pause
exit /b 1

:kota
echo.
echo   Gemini su an yanit vermiyor (yogunluk veya gunluk ucretsiz kota).
echo   Biraz sonra bu dosyayi tekrar acin.
pause
exit /b 1

:hata
echo.
echo   Bir hata oldu. Claude'a "bitti" yazin; son-calisma.log dosyasina bakacak.
pause
exit /b 1
