# Общие функции скриптов развёртывания Offix на Windows (PowerShell 5.1+).
# Файл подключается из других скриптов: . (Join-Path $ScriptDir 'common.ps1')

function Step([string]$Text) { Write-Host ''; Write-Host "==> $Text" -ForegroundColor Cyan }
function Ok([string]$Text) { Write-Host "OK  $Text" -ForegroundColor Green }
function Warn([string]$Text) { Write-Host "!!  $Text" -ForegroundColor Yellow }
function Bad([string]$Text) { Write-Host "XX  $Text" -ForegroundColor Red }

function Assert-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Запустите PowerShell от имени администратора.'
  }
}

# Запуск внешней программы с проверкой кода выхода
# (в PowerShell 5.1 ошибка внешней команды сама по себе скрипт не останавливает).
function Invoke-Native {
  param([string]$File, [string[]]$Arguments, [string]$WorkDir = (Get-Location).Path)
  Push-Location $WorkDir
  try {
    & $File @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "Команда завершилась с ошибкой (код $LASTEXITCODE): $File $($Arguments -join ' ')"
    }
  } finally {
    Pop-Location
  }
}

# Чтение server\.env в словарь (как это делает dotenv: всё после # без кавычек — комментарий).
function Read-DotEnv([string]$Path) {
  $vars = @{}
  if (-not (Test-Path $Path)) { return $vars }
  foreach ($line in Get-Content -Path $Path -Encoding UTF8) {
    $t = $line.Trim()
    if ($t -eq '' -or $t.StartsWith('#')) { continue }
    $i = $t.IndexOf('=')
    if ($i -lt 1) { continue }
    $key = $t.Substring(0, $i).Trim()
    $value = $t.Substring($i + 1).Trim()
    $quoted = $value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))
    if ($quoted) {
      $value = $value.Substring(1, $value.Length - 2)
    } else {
      $hash = $value.IndexOf('#')
      if ($hash -ge 0) { $value = $value.Substring(0, $hash).Trim() }
    }
    $vars[$key] = $value
  }
  return $vars
}

function Get-ServerPort([string]$ServerDir) {
  $envVars = Read-DotEnv (Join-Path $ServerDir '.env')
  if ($envVars.ContainsKey('PORT') -and $envVars['PORT']) { return [int]$envVars['PORT'] }
  return 5000
}

function Wait-ServiceStatus([string]$Name, [string]$Status, [int]$Seconds) {
  $svc = Get-Service -Name $Name -ErrorAction SilentlyContinue
  if (-not $svc) { return }
  try {
    $svc.WaitForStatus($Status, [TimeSpan]::FromSeconds($Seconds))
  } catch {
    throw "Служба $Name не перешла в состояние $Status за $Seconds с"
  }
}

function Wait-Health([int]$Port, [int]$Seconds) {
  $url = "http://127.0.0.1:$Port/api/health"
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-RestMethod -Uri $url -TimeoutSec 5 -UseBasicParsing
      if ($r.status -eq 'ok') { Ok "Сервер отвечает: $url"; return }
    } catch { }
    Start-Sleep -Seconds 2
  }
  throw "Сервер не ответил на $url за $Seconds с. Смотрите журнал logs\server.log"
}

# npm ci только если package-lock.json изменился с прошлой установки (экономит минуты при обновлении).
function Test-DependenciesChanged([string]$Dir) {
  $lock = Join-Path $Dir 'package-lock.json'
  $stamp = Join-Path $Dir 'node_modules\.offix-lock-hash'
  if (-not (Test-Path $stamp)) { return $true }
  $hash = (Get-FileHash -Path $lock -Algorithm SHA256).Hash
  return ((Get-Content -Path $stamp -Raw).Trim() -ne $hash)
}

function Install-Dependencies([string]$Dir) {
  Invoke-Native 'npm.cmd' @('ci', '--no-audit', '--no-fund') $Dir
  $hash = (Get-FileHash -Path (Join-Path $Dir 'package-lock.json') -Algorithm SHA256).Hash
  Set-Content -Path (Join-Path $Dir 'node_modules\.offix-lock-hash') -Value $hash -Encoding ASCII
}

# Заменяет папку $Target на $Next, предыдущую версию оставляет в $Target-prev (для отката).
function Switch-Folder([string]$Target, [string]$Next) {
  $prev = "$Target-prev"
  if (Test-Path $prev) { Remove-Item -Path $prev -Recurse -Force }
  if (Test-Path $Target) { Rename-Item -Path $Target -NewName (Split-Path $prev -Leaf) }
  Rename-Item -Path $Next -NewName (Split-Path $Target -Leaf)
}
