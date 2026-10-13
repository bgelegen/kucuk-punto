# Asks for the Gemini key without echoing it and writes .env (never committed, see .gitignore).
$s = Read-Host '  Gemini API anahtari' -AsSecureString
$b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
$k = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b).Trim()
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b)
if ($k.Length -lt 20) { Write-Host '  Anahtar cok kisa gorunuyor. calistir.bat dosyasini tekrar acip yeniden deneyin.'; exit 1 }
[IO.File]::WriteAllText((Join-Path (Get-Location) '.env'), "KP_PROVIDER=gemini`nKP_API_KEY=$k`n")
Write-Host '  Kaydedildi.'
