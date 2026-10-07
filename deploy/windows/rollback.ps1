<#
.SYNOPSIS
  Откат к предыдущей версии после неудачного обновления (папки server\dist-prev и web\dist-prev).
  База данных не откатывается: миграции пишутся так, чтобы старая версия с новой схемой работала.
#>
param(
  [string]$Root = '',
  [string]$Service = 'Offix'
)

$ErrorActionPreference = 'Stop'
# Папка скрипта: $PSScriptRoot бывает пустым (зависит от способа запуска), поэтому есть запасные способы.
$ScriptDir = if ($PSScriptRoot) { $PSScriptRoot } elseif ($PSCommandPath) { Split-Path -Parent $PSCommandPath } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $Root) { $Root = (Resolve-Path (Join-Path $ScriptDir '..\..')).Path }
. (Join-Path $ScriptDir 'common.ps1')
Assert-Admin

$server = Join-Path $Root 'server'
$web = Join-Path $Root 'web'
foreach ($dir in @((Join-Path $server 'dist-prev'), (Join-Path $web 'dist-prev'))) {
  if (-not (Test-Path $dir)) { throw "Нет предыдущей версии: $dir" }
}

Step "Останавливаю службу $Service"
$dependents = Stop-OffixService $Service

Step 'Возвращаю предыдущую версию'
foreach ($pair in @(@($server, 'dist'), @($web, 'dist'))) {
  $current = Join-Path $pair[0] $pair[1]
  $prev = "$current-prev"
  $failed = "$current-failed"
  if (Test-Path $failed) { Remove-Item -Path $failed -Recurse -Force }
  if (Test-Path $current) { Rename-Item -Path $current -NewName (Split-Path $failed -Leaf) }
  Rename-Item -Path $prev -NewName (Split-Path $current -Leaf)
}

Step "Запускаю службу $Service"
Start-OffixService $Service $dependents
Wait-Health (Get-ServerPort $server) 90
Ok 'Откат выполнен. Неудачная версия лежит в *-failed для разбора.'
