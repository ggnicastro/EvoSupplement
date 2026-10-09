@echo off
setlocal DisableDelayedExpansion
set "EVOSUPPLEMENT_ROOT=%~dp0"
title EvoSupplement - local supplement
powershell.exe -NoLogo -NoProfile -Command "$ErrorActionPreference = 'Stop'; try { Add-Type -Path (Join-Path $env:EVOSUPPLEMENT_ROOT '_portable\launcher.cs'); [EvoSupplementPortable]::Run($env:EVOSUPPLEMENT_ROOT) } catch { Write-Host ('Could not open the supplement: ' + $_.Exception.Message); exit 1 }"
if errorlevel 1 (
  echo.
  echo Extract the entire ZIP and try again.
  echo If your organization blocks PowerShell, contact your IT support.
  pause
)
endlocal
