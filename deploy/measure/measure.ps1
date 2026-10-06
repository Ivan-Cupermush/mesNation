<#
.SYNOPSIS
  Замер скорости Offix с этого компьютера: сравнить адреса (Cloudflare и VPS).

.DESCRIPTION
  Для каждого адреса — по 10 запросов: проверка сервера, главная страница, скрипт сайта.
  Печатает медиану (мс): соединение, TLS, первый байт, всего — и число ошибок.
  Запускать с разных сетей: офис, домашний Wi-Fi, мобильный интернет разных операторов.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File measure.ps1 https://offixcrm.ru https://test.offixcrm.ru
#>
param(
  [Parameter(Mandatory = $true, ValueFromRemainingArguments = $true)][string[]]$Urls,
  [int]$Count = 10
)

$curl = Get-Command curl.exe -ErrorAction SilentlyContinue
if (-not $curl) { throw 'curl.exe не найден (есть в Windows 10 1803+ и Windows Server 2019+).' }

function Median([double[]]$Values) {
  if (-not $Values -or $Values.Count -eq 0) { return '-' }
  $s = $Values | Sort-Object
  $n = $s.Count
  if ($n % 2) { return [int]$s[($n - 1) / 2] }
  return [int](($s[$n / 2 - 1] + $s[$n / 2]) / 2)
}

$rows = @()
foreach ($u in $Urls) {
  $base = $u.TrimEnd('/')
  $html = & $curl.Source -s -m 15 "$base/"
  $asset = [regex]::Match(($html -join "`n"), '/assets/[^"]+\.js').Value
  $paths = @('/api/health', '/')
  if ($asset) { $paths += $asset }
  foreach ($path in $paths) {
    $connect = @(); $tls = @(); $first = @(); $total = @(); $errors = 0
    for ($i = 0; $i -lt $Count; $i++) {
      $out = & $curl.Source -s -o NUL -m 30 -H 'Cache-Control: no-cache' -w '%{http_code} %{time_connect} %{time_appconnect} %{time_starttransfer} %{time_total}' "$base$path"
      $p = "$out".Split(' ')
      if ($p.Count -lt 5 -or -not $p[0].StartsWith('2')) { $errors++; continue }
      $inv = [Globalization.CultureInfo]::InvariantCulture
      $tc = [double]::Parse($p[1], $inv); $ta = [double]::Parse($p[2], $inv)
      $connect += $tc * 1000
      $tls += [math]::Max(0, ($ta - $tc) * 1000) * [int]($ta -gt 0)
      $first += [double]::Parse($p[3], $inv) * 1000
      $total += [double]::Parse($p[4], $inv) * 1000
    }
    $rows += [pscustomobject]@{
      'Адрес'      = $base
      'Что'        = $(if ($path.StartsWith('/assets/')) { 'скрипт сайта' } else { $path })
      'Соединение' = Median $connect
      'TLS'        = Median $tls
      '1-й байт'   = Median $first
      'Всего'      = Median $total
      'Ошибок'     = "$errors/$Count"
    }
  }
}
$rows | Format-Table -AutoSize
