<#
.SYNOPSIS
  Туннель от сервера в офисе к VPS-«входной двери» (встроенный в Windows OpenSSH).

.DESCRIPTION
  Сервер в офисе САМ подключается к VPS (исходящее соединение по SSH, порт 22):
  входящих портов в офисе не нужно, внешний IP офиса нигде не публикуется.
  Пользователи открывают сайт на VPS, а VPS передаёт запросы по туннелю сюда,
  на сервер Offix (127.0.0.1:5000).

  Туннель работает службой Windows «OffixTunnel» (через NSSM): стартует с системой,
  при обрыве переподключается сам через несколько секунд.

  Порядок:
    1. На VPS выполнен deploy/vps/setup.sh — он печатает готовую команду для этого скрипта.
    2. Этот скрипт создаёт ключ офиса и печатает команду  sudo offix-allow-office '...'
       — её нужно выполнить на VPS. Затем нажать Enter здесь.
    3. Скрипт проверяет подключение и запускает службу.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File C:\mesNation\deploy\windows\install-tunnel.ps1 -VpsHost 203.0.113.10 -HostKey "ssh-ed25519 AAAA..."
#>
param(
  [Parameter(Mandatory = $true)][string]$VpsHost,
  # Ключ VPS (печатает setup.sh): защищает от подмены сервера по дороге.
  [Parameter(Mandatory = $true)][string]$HostKey,
  [string]$Root = '',
  [string]$Service = 'OffixTunnel',
  [string]$Nssm = 'nssm.exe',
  [string]$Dir = 'C:\offix-tunnel',
  [int]$RemotePort = 15000,
  [int]$SshPort = 22,
  [string]$User = 'offix-tunnel'
)

$ErrorActionPreference = 'Stop'
# Папка скрипта: $PSScriptRoot бывает пустым (зависит от способа запуска), поэтому есть запасные способы.
$ScriptDir = if ($PSScriptRoot) { $PSScriptRoot } elseif ($PSCommandPath) { Split-Path -Parent $PSCommandPath } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $Root) { $Root = (Resolve-Path (Join-Path $ScriptDir '..\..')).Path }
. (Join-Path $ScriptDir 'common.ps1')
Assert-Admin

Step 'Проверяю окружение'
$ssh = Join-Path $env:WINDIR 'System32\OpenSSH\ssh.exe'
$keygen = Join-Path $env:WINDIR 'System32\OpenSSH\ssh-keygen.exe'
if (-not (Test-Path $ssh)) {
  Warn 'Клиент OpenSSH не установлен — ставлю компонент Windows (нужен интернет)'
  Add-WindowsCapability -Online -Name 'OpenSSH.Client~~~~0.0.1.0' | Out-Null
  if (-not (Test-Path $ssh)) { throw 'Не удалось установить OpenSSH.Client. Установите: Параметры → Приложения → Дополнительные компоненты → Клиент OpenSSH.' }
}
# ssh -V печатает версию в поток ошибок: в Windows PowerShell 5.1 при $ErrorActionPreference='Stop' это считалось бы сбоем.
$sshVersion = ((cmd.exe /c "`"$ssh`" -V 2>&1") | Out-String).Trim()
Ok "OpenSSH: $sshVersion"
if (-not (Get-Command $Nssm -ErrorAction SilentlyContinue)) {
  throw 'NSSM не найден. Установите: winget install NSSM.NSSM (или укажите путь: -Nssm C:\tools\nssm.exe)'
}
if ($HostKey -notmatch '^ssh-ed25519 [A-Za-z0-9+/=]+$') { throw 'HostKey должен быть строкой вида "ssh-ed25519 AAAA..." — скопируйте её из вывода setup.sh целиком.' }

$localPort = Get-ServerPort (Join-Path $Root 'server')
try {
  Wait-Health $localPort 5
} catch {
  Warn "Сервер Offix не отвечает на 127.0.0.1:$localPort — туннель поднимется, но сайт покажет «сервер недоступен», пока служба Offix не запущена."
}

# Права на ключ. OpenSSH для Windows отказывается читать ключ, если у него есть доступ у «чужих»:
# службе (она работает от SYSTEM) нужен ключ, доступный ТОЛЬКО SYSTEM, а вам для проверки входа —
# доступный администратору. Поэтому перед проверкой ключ открываем, перед запуском службы закрываем.
$sidSystem = '*S-1-5-18'
$sidAdmins = '*S-1-5-32-544'
function Open-KeyForAdmin([string]$Path) {
  if (-not (Test-Path $Path)) { return }
  # Через cmd: вывод ошибок программы в PowerShell 5.1 считался бы сбоем скрипта.
  cmd.exe /c "takeown.exe /f `"$Path`" >nul 2>&1"
  if ($LASTEXITCODE -ne 0) { Warn "Не удалось сменить владельца ключа (код $LASTEXITCODE) — продолжаю" }
  Invoke-Native 'icacls.exe' @($Path, '/inheritance:r', '/grant:r', "${sidAdmins}:F", '/grant:r', "${sidSystem}:F") | Out-Null
}
function Lock-KeyForSystem([string]$Path) {
  Invoke-Native 'icacls.exe' @($Path, '/setowner', $sidSystem) | Out-Null
  Invoke-Native 'icacls.exe' @($Path, '/inheritance:r', '/grant:r', "${sidSystem}:F") | Out-Null
  # Убираем всё остальное: администраторов и текущего пользователя (ошибка «нет такой записи» не страшна).
  foreach ($who in @($sidAdmins, "$env:USERDOMAIN\$env:USERNAME", 'BUILTIN\Users', 'Everyone', 'NT AUTHORITY\Authenticated Users')) {
    cmd.exe /c "icacls.exe `"$Path`" /remove `"$who`" >nul 2>&1"
  }
}

$net = Test-NetConnection -ComputerName $VpsHost -Port $SshPort -WarningAction SilentlyContinue
if (-not $net.TcpTestSucceeded) { throw "Нет соединения с $VpsHost`:$SshPort. Проверьте IP VPS и что исходящие подключения на порт $SshPort не закрыты." }
Ok "VPS $VpsHost`:$SshPort доступен"

Step "Ключи в $Dir"
New-Item -ItemType Directory -Path $Dir -Force | Out-Null
# Доступ к папке — только системе и администраторам (иначе ssh откажется читать ключ).
Invoke-Native 'icacls.exe' @($Dir, '/inheritance:r', '/grant:r', '*S-1-5-18:(OI)(CI)F', '/grant:r', '*S-1-5-32-544:(OI)(CI)F') | Out-Null
$key = Join-Path $Dir 'id_ed25519'
if (-not (Test-Path $key)) {
  # Ключ без пароля (служба запускается без человека). Пустой аргумент Windows PowerShell 5
  # передаёт программам только как '""', PowerShell 7 — как ''.
  $empty = if ($PSVersionTable.PSVersion.Major -ge 7) { '' } else { '""' }
  Invoke-Native $keygen @('-q', '-t', 'ed25519', '-N', $empty, '-C', "offix-office-$env:COMPUTERNAME", '-f', $key)
  Ok 'Создан ключ офиса'
} else {
  Ok 'Ключ офиса уже есть — использую его'
}
$known = Join-Path $Dir 'known_hosts'
$hostEntry = if ($SshPort -eq 22) { $VpsHost } else { "[$VpsHost]:$SshPort" }
Set-Content -Path $known -Value "$hostEntry $HostKey" -Encoding ASCII
Open-KeyForAdmin $key
$pub = (Get-Content "$key.pub" -Raw).Trim()

Write-Host ''
Write-Host 'Выполните на VPS (в SSH-сессии) одну команду:' -ForegroundColor Cyan
Write-Host ''
Write-Host "  sudo offix-allow-office '$pub'" -ForegroundColor White
Write-Host ''
Read-Host 'Когда выполните — нажмите Enter'

$sshArgs = @(
  '-N', '-T',
  '-p', "$SshPort",
  '-i', $key,
  '-o', "UserKnownHostsFile=$known",
  '-o', 'StrictHostKeyChecking=yes',
  '-o', 'IdentitiesOnly=yes',
  '-o', 'BatchMode=yes',
  # Обрыв связи замечаем за ~45 с, процесс завершается, служба поднимает его заново.
  '-o', 'ServerAliveInterval=15',
  '-o', 'ServerAliveCountMax=3',
  '-o', 'ExitOnForwardFailure=yes',
  '-o', 'ConnectTimeout=15',
  '-R', "127.0.0.1:${RemotePort}:127.0.0.1:${localPort}",
  "$User@$VpsHost"
)

Step 'Проверяю вход на VPS'
# Работающая служба туннеля держит порт на VPS — останавливаем её на время проверки.
if (Get-Service -Name $Service -ErrorAction SilentlyContinue) {
  & $Nssm stop $Service | Out-Null
  Start-Sleep -Seconds 2
}
$probe = Start-Process -FilePath $ssh -ArgumentList $sshArgs -NoNewWindow -PassThru -RedirectStandardError (Join-Path $Dir 'probe.log')
Start-Sleep -Seconds 8
if ($probe.HasExited) {
  $err = Get-Content (Join-Path $Dir 'probe.log') -Raw
  throw "Туннель не открылся: $err`nЧастые причины: команда offix-allow-office не выполнена на VPS; неверный HostKey; служба OffixTunnel уже запущена и держит порт."
}
Stop-Process -Id $probe.Id -Force
Ok 'Вход по ключу работает, туннель открывается'

Lock-KeyForSystem $key
Step "Служба $Service"
$logs = Join-Path $Root 'logs'
New-Item -ItemType Directory -Path $logs -Force | Out-Null
if (Get-Service -Name $Service -ErrorAction SilentlyContinue) {
  & $Nssm stop $Service | Out-Null
} else {
  Invoke-Native $Nssm @('install', $Service, $ssh)
}
# NSSM передаёт параметры одной строкой: пути в кавычках на случай пробелов.
$quoted = ($sshArgs | ForEach-Object { if ($_ -match '\s') { '"' + $_ + '"' } else { $_ } }) -join ' '
$settings = @(
  @('Application', $ssh),
  @('AppParameters', $quoted),
  @('AppDirectory', $Dir),
  @('DisplayName', 'Offix — туннель к VPS'),
  @('Description', "Исходящий SSH-туннель: $VpsHost (127.0.0.1:$RemotePort) -> этот сервер (127.0.0.1:$localPort)"),
  @('Start', 'SERVICE_AUTO_START'),
  @('AppStdout', (Join-Path $logs 'tunnel.log')),
  @('AppStderr', (Join-Path $logs 'tunnel.log')),
  @('AppRotateFiles', '1'),
  @('AppRotateBytes', '5242880'),
  @('AppExit', 'Default', 'Restart'),
  @('AppRestartDelay', '5000')
)
foreach ($s in $settings) { Invoke-Native $Nssm (@('set', $Service) + $s) }
# Туннель имеет смысл после старта сервера Offix (если он установлен службой).
if (Get-Service -Name 'Offix' -ErrorAction SilentlyContinue) { Invoke-Native $Nssm @('set', $Service, 'DependOnService', 'Offix') }
Invoke-Native $Nssm @('start', $Service)
Wait-ServiceStatus $Service 'Running' 20
Start-Sleep -Seconds 5
if ((Get-Service $Service).Status -ne 'Running') { throw "Служба $Service не держится запущенной. Журнал: $logs\tunnel.log" }
Ok "Служба $Service работает (автозапуск, журнал: $logs\tunnel.log)"

Write-Host ''
Write-Host 'Проверка на VPS:  sudo offix-status   — должно быть «туннель подключён» и ответ сервера {"status":"ok"...}' -ForegroundColor Cyan
