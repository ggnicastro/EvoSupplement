@echo off
setlocal DisableDelayedExpansion
set "EVOSUPPLEMENT_ROOT=%~dp0"
title EvoSupplement - suplemento local
powershell.exe -NoLogo -NoProfile -Command "$ErrorActionPreference = 'Stop'; try { Add-Type -Path (Join-Path $env:EVOSUPPLEMENT_ROOT '_portable\launcher.cs'); [EvoSupplementPortable]::Run($env:EVOSUPPLEMENT_ROOT) } catch { Write-Host ('Nao foi possivel abrir o suplemento: ' + $_.Exception.Message); exit 1 }"
if errorlevel 1 (
  echo.
  echo Extraia o ZIP completo e tente novamente.
  echo Se o PowerShell estiver bloqueado pela sua organizacao, consulte o suporte de TI.
  pause
)
endlocal
