<#
.SYNOPSIS
  Регистрирует Offix как службу Windows (через NSSM): автозапуск при загрузке,
  перезапуск при падении, журнал в logs\server.log с ротацией.

.DESCRIPTION
  Вместо окон с «npm run dev», которые кто-то запускает, а кто-то закрывает,
  сервер работает как служба: один процесс, один порт (5000), сайт и API вместе.

  Перед запуском:
    1. Установлены Node.js 22 LTS, Git, PostgreSQL, NSSM (winget install NSSM.NSSM).
    2. Заполнен server\.env (образец — server\.env.example).
  После: update.ps1 -SkipPull — соберёт сайт и сервер и запустит службу.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File C:\mesNation\deploy\windows\install-service.ps1 -StopOldProcesses
#>
param(
  [string]$Root = '',
  [string]$Service = 'Offix',
  [string]$Nssm = 'nssm.exe',
  # Завершить старые ручные запуски (Vite на 5173, node на порту сервера).
  [switch]$StopOldProcesses
)

$ErrorActionPreference = 'Stop'
# Папка скрипта: $PSScriptRoot бывает пустым (зависит от способа запуска), поэтому есть запасные способы.
$ScriptDir = if ($PSScriptRoot) { $PSScriptRoot } elseif ($PSCommandPath) { Split-Path -Parent $PSCommandPath } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $Root) { $Root = (Resolve-Path (Join-Path $ScriptDir '..\..')).Path }
. (Join-Path $ScriptDir 'common.ps1')
Assert-Admin

$server = Join-Path $Root 'server'
$logs = Join-Path $Root 'logs'

Step 'Проверяю окружение'
$node = (Get-Command node.exe -ErrorAction SilentlyContinue)
if (-not $node) { throw 'Node.js не найден. Установите Node.js 22 LTS.' }
$nodeMajor = [int]((& node.exe -v).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 22) { throw "Нужен Node.js 22+, установлен $(& node.exe -v)" }
Ok "Node.js $(& node.exe -v): $($node.Source)"

# NSSM, положенный вручную в C:\nssm (на Windows Server без winget), находим сам.
if (-not (Get-Command $Nssm -ErrorAction SilentlyContinue) -and (Test-Path 'C:\nssm\nssm.exe')) { $Nssm = 'C:\nssm\nssm.exe' }
if (-not (Get-Command $Nssm -ErrorAction SilentlyContinue)) {
  throw 'NSSM не найден. Установите: winget install NSSM.NSSM, либо положите nssm.exe в C:\nssm (или укажите путь: -Nssm C:\tools\nssm.exe)'
}

$envFile = Join-Path $server '.env'
if (-not (Test-Path $envFile)) { throw "Нет $envFile. Скопируйте server\.env.example в server\.env и заполните." }
$envVars = Read-DotEnv $envFile
$rawSecret = (Get-Content $envFile -Encoding UTF8 | Where-Object { $_ -match '^\s*JWT_SECRET\s*=' } | Select-Object -First 1)
if ($rawSecret -and $rawSecret.Contains('#') -and -not ($rawSecret -match '=\s*["'']')) {
  throw 'В JWT_SECRET есть символ # — всё после него считается комментарием и ключ обрезается. Сгенерируйте ключ из букв и цифр (см. .env.example).'
}
if (-not $envVars['JWT_SECRET'] -or $envVars['JWT_SECRET'].Length -lt 32) { throw 'JWT_SECRET в .env пустой или короче 32 символов.' }
if ($envVars['NODE_ENV'] -ne 'production') { Warn 'NODE_ENV в .env не production — для боевого сервера поставьте NODE_ENV=production' }
$port = Get-ServerPort $server
Ok ".env в порядке (порт $port)"

Step 'Ищу старые ручные запуски'
foreach ($p in @(5173, $port)) {
  $listeners = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
  foreach ($l in $listeners) {
    $proc = Get-Process -Id $l.OwningProcess -ErrorAction SilentlyContinue
    $name = if ($proc) { $proc.ProcessName } else { '?' }
    if ($StopOldProcesses) {
      Stop-Process -Id $l.OwningProcess -Force
      Ok "Остановлен $name (PID $($l.OwningProcess)) на порту $p"
    } else {
      Warn "Порт $p занят: $name (PID $($l.OwningProcess)). Закройте окно с npm run dev или запустите скрипт с -StopOldProcesses"
    }
  }
}

Step "Регистрирую службу $Service"
New-Item -ItemType Directory -Path $logs -Force | Out-Null
if (Get-Service -Name $Service -ErrorAction SilentlyContinue) {
  Warn "Служба $Service уже есть — обновляю параметры"
  & $Nssm stop $Service | Out-Null
} else {
  Invoke-Native $Nssm @('install', $Service, $node.Source, 'dist\src\index.js')
}
$settings = @(
  @('Application', $node.Source),
  @('AppParameters', 'dist\src\index.js'),
  @('AppDirectory', $server),
  @('DisplayName', 'Offix — сервер и сайт'),
  @('Description', 'Offix: API, веб-версия и сообщения в реальном времени (порт ' + $port + ')'),
  @('Start', 'SERVICE_AUTO_START'),
  @('AppStdout', (Join-Path $logs 'server.log')),
  @('AppStderr', (Join-Path $logs 'server.log')),
  @('AppRotateFiles', '1'),
  @('AppRotateOnline', '1'),
  @('AppRotateBytes', '20971520'),
  @('AppExit', 'Default', 'Restart'),
  @('AppRestartDelay', '5000'),
  # Ctrl+C и 15 секунд на корректную остановку (сервер дописывает запросы и закрывает БД).
  @('AppStopMethodConsole', '15000')
)
foreach ($s in $settings) {
  Invoke-Native $Nssm (@('set', $Service) + $s)
}
Ok "Служба $Service зарегистрирована (автозапуск, журнал: $logs\server.log)"
Write-Host ''
Write-Host 'Дальше: соберите и запустите —' -ForegroundColor Cyan
Write-Host "  powershell -ExecutionPolicy Bypass -File `"$ScriptDir\update.ps1`" -SkipPull"
