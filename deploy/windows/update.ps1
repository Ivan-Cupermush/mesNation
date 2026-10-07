<#
.SYNOPSIS
  Обновление Offix на сервере: git → сборка сайта и сервера → подмена → перезапуск → проверка.

.DESCRIPTION
  Сборка идёт в отдельные папки (web\dist-next, server\dist-next), служба
  останавливается только на время подмены папок — простой несколько секунд.
  Если зависимости сервера изменились, службу приходится остановить на время
  npm ci (Windows не даёт заменить загруженные модули bcrypt/sharp).
  Предыдущая версия остаётся в *-prev: откат — rollback.ps1.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File C:\mesNation\deploy\windows\update.ps1
.EXAMPLE
  # первый запуск после install-service.ps1 (код уже на месте)
  powershell -ExecutionPolicy Bypass -File C:\mesNation\deploy\windows\update.ps1 -SkipPull
#>
param(
  [string]$Root = '',
  [string]$Service = 'Offix',
  [string]$Branch = 'main',
  [switch]$SkipPull
)

$ErrorActionPreference = 'Stop'
# Папка скрипта: $PSScriptRoot бывает пустым (зависит от способа запуска), поэтому есть запасные способы.
$ScriptDir = if ($PSScriptRoot) { $PSScriptRoot } elseif ($PSCommandPath) { Split-Path -Parent $PSCommandPath } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $Root) { $Root = (Resolve-Path (Join-Path $ScriptDir '..\..')).Path }
. (Join-Path $ScriptDir 'common.ps1')
Assert-Admin

$server = Join-Path $Root 'server'
$web = Join-Path $Root 'web'
$port = Get-ServerPort $server

if (-not (Get-Service -Name $Service -ErrorAction SilentlyContinue)) {
  throw "Служба $Service не найдена. Сначала выполните install-service.ps1"
}

if (-not $SkipPull) {
  Step "Получаю обновления из origin/$Branch"
  Invoke-Native 'git' @('-C', $Root, 'fetch', 'origin', $Branch)
  # Только fast-forward: локальные правки на сервере не затираются молча.
  Invoke-Native 'git' @('-C', $Root, 'merge', '--ff-only', "origin/$Branch")
}
$version = (& git -C $Root rev-parse --short HEAD)

Step 'Собираю сайт'
if (Test-DependenciesChanged $web) { Install-Dependencies $web } else { Ok 'Зависимости сайта не менялись' }
$webNext = Join-Path $web 'dist-next'
if (Test-Path $webNext) { Remove-Item -Path $webNext -Recurse -Force }
Invoke-Native 'npm.cmd' @('run', 'build', '--', '--outDir', 'dist-next', '--emptyOutDir') $web
# Файлы предыдущей версии сайта кладём рядом с новыми: у вкладок, открытых до
# обновления, догрузятся их старые чанки, а не 404.
$oldAssets = Join-Path $web 'dist\assets'
$newAssets = Join-Path $webNext 'assets'
if (Test-Path $oldAssets) {
  Get-ChildItem -Path $oldAssets -File |
    Where-Object { -not (Test-Path (Join-Path $newAssets $_.Name)) } |
    Copy-Item -Destination $newAssets
}

$depsChanged = Test-DependenciesChanged $server
$stopped = $false
try {
  if ($depsChanged) {
    Step "Зависимости сервера изменились — останавливаю службу $Service на время установки"
    Stop-Service -Name $Service
    Wait-ServiceStatus $Service 'Stopped' 60
    $stopped = $true
    Install-Dependencies $server
  }

  Step 'Собираю сервер'
  $serverNext = Join-Path $server 'dist-next'
  if (Test-Path $serverNext) { Remove-Item -Path $serverNext -Recurse -Force }
  Invoke-Native 'npx.cmd' @('tsc', '-p', 'tsconfig.json', '--outDir', 'dist-next') $server
  Copy-Item -Path (Join-Path $server 'src\db\migrations') -Destination (Join-Path $serverNext 'src\db\migrations') -Recurse

  if (-not $stopped) {
    Step "Останавливаю службу $Service"
    Stop-Service -Name $Service
    Wait-ServiceStatus $Service 'Stopped' 60
    $stopped = $true
  }

  Step 'Подменяю версии'
  Switch-Folder (Join-Path $server 'dist') $serverNext
  Switch-Folder (Join-Path $web 'dist') $webNext

  Step "Запускаю службу $Service"
  Start-Service -Name $Service
  $stopped = $false
  Wait-Health $port 90
  Ok "Обновлено до версии $version"
} catch {
  Bad $_.Exception.Message
  if ($stopped) {
    Warn "Пробую снова запустить службу $Service на прежней версии"
    Start-Service -Name $Service -ErrorAction SilentlyContinue
  }
  throw
}
