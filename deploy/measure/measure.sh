#!/usr/bin/env bash
# Замер скорости Offix с этого компьютера: сравнить адреса (Cloudflare и VPS).
#   bash measure.sh https://offixcrm.ru https://test.offixcrm.ru
# Для каждого адреса — 10 запросов: проверка сервера, главная страница, скрипт сайта.
# Печатает медиану: соединение, TLS, первый байт, всего (в мс) и ошибки.
set -uo pipefail
COUNT="${COUNT:-10}"
[[ $# -gt 0 ]] || { echo "Укажите адреса: bash measure.sh https://offixcrm.ru https://test.offixcrm.ru"; exit 1; }

median() { sort -n | awk '{a[NR]=$1} END {if (NR==0) {print "-"; exit} m=(NR%2)?a[(NR+1)/2]:(a[NR/2]+a[NR/2+1])/2; printf "%d", m}'; }

printf '%-34s %-12s %8s %8s %10s %8s %6s\n' "адрес" "что" "соедин." "TLS" "1-й байт" "всего" "ошибок"
for base in "$@"; do
  base="${base%/}"
  asset=$(curl -s -m 15 "$base/" | grep -oE '/assets/[^"]+\.js' | head -1)
  for path in /api/health / ${asset:-}; do
    label=$path; [[ "$path" == /assets/* ]] && label="скрипт сайта"
    c=(); t=(); f=(); a=(); errs=0
    for ((i = 0; i < COUNT; i++)); do
      out=$(curl -s -o /dev/null -m 30 -H 'Cache-Control: no-cache' -w '%{http_code} %{time_connect} %{time_appconnect} %{time_starttransfer} %{time_total}' "$base$path") || true
      read -r code tc ta tf tt <<<"$out"
      if [[ "${code:-000}" != 2* ]]; then errs=$((errs + 1)); continue; fi
      c+=("$(awk -v x="$tc" 'BEGIN{print x*1000}')"); a+=("$(awk -v x="$ta" -v y="$tc" 'BEGIN{d=(x-y)*1000; print (x>0 && d>0)?d:0}')")
      f+=("$(awk -v x="$tf" 'BEGIN{print x*1000}')"); t+=("$(awk -v x="$tt" 'BEGIN{print x*1000}')")
    done
    printf '%-34s %-12s %8s %8s %10s %8s %6s\n' "$base" "$label" \
      "$(printf '%s\n' "${c[@]:-}" | median)" "$(printf '%s\n' "${a[@]:-}" | median)" \
      "$(printf '%s\n' "${f[@]:-}" | median)" "$(printf '%s\n' "${t[@]:-}" | median)" "$errs/$COUNT"
  done
done
