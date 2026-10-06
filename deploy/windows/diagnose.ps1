<#
.SYNOPSIS
  Диагностика Offix на сервере: службы, порты, сборка сайта, ответы сервера,
  DNS и доступность снаружи. Вывод можно целиком прислать разработчикам.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File C:\mesNation\deploy\windows\diagnose.ps1 > diag.txt
#>
param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
  [string]$Service = 'Offix',
  [string[]]$Domains = @('offixcrm.ru', 'web.offixcrm.ru')
)

$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot 'common.ps1')

$server = Join-Path $Root 'server'
$web = Join-Path $Root 'web'
$port = Get-ServerPort $server
$envVars = Read-DotEnv (Join-Path $server '.env')

Write-Host "Offix — диагностика $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), компьютер $env:COMPUTERNAME"
try { Write-Host "Версия кода: $(& git -C $Root log -1 --format='%h %ci %s')" } catch { }

Step 'Железо и система'
try {
  $os = Get-CimInstance Win32_OperatingSystem
  Write-Host "    Система:    $($os.Caption) $($os.Version)"
  $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
  Write-Host "    Процессор:  $($cpu.Name.Trim()) — ядер $($cpu.NumberOfCores), потоков $($cpu.NumberOfLogicalProcessors)"
  $ramGb = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
  $freeGb = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
  Write-Host "    Память:     $ramGb ГБ (свободно $freeGb ГБ)"
  foreach ($d in Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3') {
    Write-Host ("    Диск {0}     {1} ГБ, свободно {2} ГБ" -f $d.DeviceID, [math]::Round($d.Size / 1GB), [math]::Round($d.FreeSpace / 1GB))
  }
  foreach ($pd in Get-PhysicalDisk -ErrorAction SilentlyContinue) {
    Write-Host ("    Накопитель: {0} — {1}, {2} ГБ" -f $pd.FriendlyName, $pd.MediaType, [math]::Round($pd.Size / 1GB))
  }
  foreach ($g in Get-CimInstance Win32_VideoController) { Write-Host "    Видео:      $($g.Name)" }
} catch { Warn "Не удалось прочитать сведения о железе: $($_.Exception.Message)" }

Step 'Службы'
$services = @($Service, 'OffixTunnel', 'cloudflared', 'Caddy') + @(Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue | ForEach-Object { $_.Name })
foreach ($name in $services) {
  $svc = Get-Service -Name $name -ErrorAction SilentlyContinue
  if (-not $svc) { Write-Host "    $name — не установлена"; continue }
  if ($svc.Status -eq 'Running') { Ok "$name — работает ($($svc.StartType))" } else { Bad "$name — $($svc.Status)" }
}

Step 'Порты'
$expected = @{ $port = 'сервер Offix (node)'; 5432 = 'PostgreSQL'; 443 = 'HTTPS (Caddy, если прямой доступ)'; 80 = 'HTTP (Caddy)'; 5173 = 'Vite dev — в продакшене НЕ должен работать' }
foreach ($p in ($expected.Keys | Sort-Object)) {
  $l = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($l) {
    $proc = Get-Process -Id $l.OwningProcess -ErrorAction SilentlyContinue
    $msg = "порт $p слушает $($proc.ProcessName) на $($l.LocalAddress) — $($expected[$p])"
    if ($p -eq 5173) { Warn $msg } else { Ok $msg }
  } else {
    Write-Host "    порт $p свободен — $($expected[$p])"
  }
}

Step 'Настройки (.env)'
foreach ($k in @('NODE_ENV', 'HOST', 'PORT', 'WEB_DIST_DIR', 'TRUST_PROXY', 'CORS_ORIGINS', 'DB_HOST', 'DB_NAME', 'LOG_LEVEL')) {
  Write-Host ("    {0,-13} = {1}" -f $k, $envVars[$k])
}
$secretLen = 0
if ($envVars['JWT_SECRET']) { $secretLen = $envVars['JWT_SECRET'].Length }
if ($secretLen -ge 32) { Ok "JWT_SECRET задан ($secretLen символов)" } else { Bad "JWT_SECRET короткий или пустой ($secretLen символов)" }

Step 'Сборка сайта'
$index = Join-Path $web 'dist\index.html'
if (Test-Path $index) { Ok "web\dist собран $((Get-Item $index).LastWriteTime)" } else { Bad 'web\dist\index.html нет — сайт не раздаётся. Запустите update.ps1' }
$serverJs = Join-Path $server 'dist\src\index.js'
if (Test-Path $serverJs) { Ok "server\dist собран $((Get-Item $serverJs).LastWriteTime)" } else { Bad 'server\dist нет — служба не запустится' }

Step 'Ответы сервера изнутри'
$base = "http://127.0.0.1:$port"
try {
  $h = Invoke-RestMethod -Uri "$base/api/health" -TimeoutSec 5 -UseBasicParsing
  Ok "/api/health: $($h.status), база: $($h.database)"
} catch { Bad "/api/health не отвечает: $($_.Exception.Message)" }
try {
  $page = Invoke-WebRequest -Uri "$base/" -Headers @{ Accept = 'text/html' } -TimeoutSec 5 -UseBasicParsing
  if ($page.Content -match 'id="root"') { Ok 'Главная страница отдаётся сервером' } else { Bad 'Главная отдаёт не страницу сайта' }
  $asset = [regex]::Match($page.Content, '/assets/[^"]+\.js').Value
  if ($asset) {
    $js = Invoke-WebRequest -Uri "$base$asset" -TimeoutSec 5 -UseBasicParsing
    Ok "Скрипт сайта $asset — $($js.Headers['Content-Type']), $([math]::Round($js.RawContentLength / 1KB)) КБ"
  }
} catch { Bad "Главная не отдаётся: $($_.Exception.Message)" }

Step 'cloudflared'
foreach ($cfg in @('C:\cloudflared\config.yml', "$env:USERPROFILE\.cloudflared\config.yml", 'C:\Windows\System32\config\systemprofile\.cloudflared\config.yml')) {
  if (Test-Path $cfg) {
    Write-Host "    $cfg"
    Get-Content $cfg | Where-Object { $_ -match 'hostname|service|protocol' } | ForEach-Object { Write-Host "      $_" }
    if ((Get-Content $cfg -Raw) -match '5173') { Warn ("В туннеле остался порт 5173 (Vite). Все адреса должны вести на http://127.0.0.1:$port") }
  }
}

Step 'DNS и доступ снаружи'
foreach ($d in $Domains) {
  try {
    $ips = (Resolve-DnsName -Name $d -Type A -ErrorAction Stop | Where-Object { $_.IPAddress } | ForEach-Object { $_.IPAddress }) -join ', '
    # Диапазоны Cloudflare: 104.16/12, 172.64/13, 188.114.96/20, 162.158/15.
    $viaCf = $ips -match '(^|, )(104\.(1[6-9]|2[0-9]|3[01])|172\.(6[4-9]|7[01])|188\.114\.(9[6-9]|10[0-9]|11[01])|162\.15[89])\.'
    $note = if ($viaCf) { 'адреса Cloudflare (трафик идёт через Cloudflare)' } else { 'прямой адрес' }
    Write-Host "    $d -> $ips ($note)"
  } catch { Bad "$d не резолвится: $($_.Exception.Message)" }
  try {
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $r = Invoke-WebRequest -Uri "https://$d/api/health" -TimeoutSec 15 -UseBasicParsing
    Ok "https://$d/api/health — $($r.StatusCode) за $($sw.ElapsedMilliseconds) мс"
  } catch { Bad "https://$d/api/health с этого компьютера недоступен: $($_.Exception.Message)" }
}

Step 'Туннель к VPS'
$tunnelLog = Join-Path $Root 'logs\tunnel.log'
if (Test-Path $tunnelLog) {
  Get-Content $tunnelLog -Tail 10 -Encoding UTF8 | ForEach-Object { Write-Host "    $_" }
} else {
  Write-Host '    туннель не настраивался (журнала logs\tunnel.log нет)'
}

Step 'Последние ошибки в журнале'
$log = Join-Path $Root 'logs\server.log'
if (Test-Path $log) {
  $errors = Get-Content $log -Tail 2000 -Encoding UTF8 | Where-Object { $_ -match '"level":(50|60)' } | Select-Object -Last 15
  if ($errors) { $errors | ForEach-Object { Write-Host "    $($_.Substring(0, [math]::Min(300, $_.Length)))" } } else { Ok 'Ошибок в последних 2000 строках нет' }
} else {
  Write-Host "    журнала $log нет (служба ещё не запускалась?)"
}
