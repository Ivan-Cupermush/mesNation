#!/usr/bin/env bash
# Offix — настройка VPS-«входной двери» (Ubuntu 22.04/24.04).
#
#   Пользователи ─HTTPS─► этот VPS (Caddy) ─► 127.0.0.1:15000 ═SSH-туннель═► сервер в офисе :5000
#
# Сервер в офисе сам подключается к VPS по SSH (входящих портов в офисе нет,
# IP офиса нигде не публикуется). На VPS нет данных — только прокси.
#
# Запуск (от root):
#   bash setup.sh --domains "test.offixcrm.ru" --email admin@offixcrm.ru
# Повторный запуск безопасен: так же меняют список доменов при переключении.
set -euo pipefail

DOMAINS=""
EMAIL=""
TUNNEL_PORT=15000
TUNNEL_USER="offix-tunnel"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domains) DOMAINS="$2"; shift 2 ;;
    --email) EMAIL="$2"; shift 2 ;;
    --tunnel-port) TUNNEL_PORT="$2"; shift 2 ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "Неизвестный параметр: $1" >&2; exit 1 ;;
  esac
done

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok() { printf '\033[32mOK\033[0m  %s\n' "$*"; }
warn() { printf '\033[33m!!\033[0m  %s\n' "$*"; }
die() { printf '\033[31mXX  %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Запустите от root: sudo bash setup.sh ..."
[[ -n "$DOMAINS" ]] || die "Укажите домены: --domains \"test.offixcrm.ru\""
[[ -n "$EMAIL" ]] || die "Укажите почту для сертификатов: --email admin@offixcrm.ru"
[[ "$TUNNEL_PORT" =~ ^[0-9]+$ ]] || die "--tunnel-port должен быть числом"
. /etc/os-release
[[ "${ID:-}" == "ubuntu" ]] || warn "Скрипт проверен на Ubuntu, у вас ${PRETTY_NAME:-неизвестная система}"

export DEBIAN_FRONTEND=noninteractive

step "Обновляю систему и ставлю пакеты"
apt-get update -q
apt-get -y -q -o Dpkg::Options::=--force-confold upgrade
apt-get -y -q install curl ca-certificates gnupg ufw fail2ban python3-systemd unattended-upgrades debian-keyring debian-archive-keyring apt-transport-https
ok "Пакеты установлены"

step "Автоматические обновления безопасности"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
CONF
cat > /etc/apt/apt.conf.d/52offix-unattended <<'CONF'
// Обновления ядра требуют перезагрузки: ночью, ~1 минута простоя.
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:30";
CONF
systemctl enable --now unattended-upgrades >/dev/null
ok "Обновления безопасности ставятся сами, перезагрузка при необходимости — в 04:30"

step "Файл подкачки и размер журналов"
if ! swapon --show | grep -q .; then
  fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  ok "Подкачка 1 ГБ"
else
  ok "Подкачка уже есть"
fi
mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nSystemMaxUse=200M\n' > /etc/systemd/journald.conf.d/offix.conf
systemctl restart systemd-journald
timedatectl set-ntp true || true

step "Пользователь для туннеля из офиса ($TUNNEL_USER)"
if ! id "$TUNNEL_USER" >/dev/null 2>&1; then
  useradd --system --create-home --shell /usr/sbin/nologin "$TUNNEL_USER"
fi
install -d -m 700 -o "$TUNNEL_USER" -g "$TUNNEL_USER" "/home/$TUNNEL_USER/.ssh"
touch "/home/$TUNNEL_USER/.ssh/authorized_keys"
chown "$TUNNEL_USER:$TUNNEL_USER" "/home/$TUNNEL_USER/.ssh/authorized_keys"
chmod 600 "/home/$TUNNEL_USER/.ssh/authorized_keys"
echo "$TUNNEL_PORT" > /etc/offix-tunnel-port
ok "Пользователь $TUNNEL_USER: без пароля и без командной строки, может только открыть туннель на 127.0.0.1:$TUNNEL_PORT"

step "SSH: настройки безопасности"
cat > /etc/ssh/sshd_config.d/20-offix-tunnel.conf <<CONF
# Туннель из офиса: только обратный проброс на один локальный порт, ничего больше.
Match User $TUNNEL_USER
    AllowTcpForwarding remote
    PermitListen 127.0.0.1:$TUNNEL_PORT
    GatewayPorts no
    X11Forwarding no
    AllowAgentForwarding no
    PermitTTY no
    ForceCommand /usr/sbin/nologin
    # Оборванный туннель освобождает порт за ~45 с, и офис сразу подключается заново.
    ClientAliveInterval 15
    ClientAliveCountMax 3
CONF
# Вход по паролю выключаем, только если у root/sudo-пользователя уже есть ключ —
# иначе можно запереть себя снаружи.
has_key=0
for f in /root/.ssh/authorized_keys /home/*/.ssh/authorized_keys; do
  [[ "$f" == "/home/$TUNNEL_USER/.ssh/authorized_keys" ]] && continue
  [[ -s "$f" ]] && has_key=1
done
if [[ $has_key -eq 1 ]]; then
  cat > /etc/ssh/sshd_config.d/10-offix-hardening.conf <<'CONF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
MaxAuthTries 4
CONF
  ok "Вход по SSH — только по ключу"
else
  warn "SSH-ключа администратора нет — вход по паролю оставлен. Добавьте ключ (ssh-copy-id) и запустите скрипт ещё раз."
fi
sshd -t || die "Ошибка в настройках SSH — ничего не перезапускаю"
# В Ubuntu 24.04 SSH запускается через сокет: новые настройки подхватит каждое новое подключение.
systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || systemctl restart ssh 2>/dev/null || true
ok "SSH перечитал настройки (текущее подключение не обрывается)"

step "Защита от перебора паролей (fail2ban)"
cat > /etc/fail2ban/jail.d/offix.local <<'CONF'
[sshd]
enabled = true
# В Ubuntu 22.04+ журнал входов — в systemd, файла auth.log может не быть.
backend = systemd
maxretry = 5
findtime = 10m
bantime = 1h
CONF
systemctl enable --now fail2ban >/dev/null
systemctl restart fail2ban
ok "fail2ban следит за SSH"

step "Брандмауэр: открыты только 22 (SSH), 80 и 443 (сайт)"
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null
ufw --force enable >/dev/null
ok "$(ufw status | head -1)"

step "Caddy (HTTPS с автоматическими сертификатами)"
if ! command -v caddy >/dev/null; then
  if curl -fsSL --max-time 20 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg; then
    curl -fsSL --max-time 20 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -q
  else
    warn "Репозиторий Caddy недоступен — ставлю версию из Ubuntu"
  fi
  apt-get -y -q install caddy
fi
ok "$(caddy version | head -1)"

mkdir -p /var/log/caddy
chown caddy:caddy /var/log/caddy
SITE_LIST=$(echo "$DOMAINS" | tr ' ,' '\n\n' | sed '/^$/d' | paste -sd, - | sed 's/,/, /g')

cat > /etc/caddy/Caddyfile <<CONF
# Создано deploy/vps/setup.sh — правки вручную перезапишутся при следующем запуске.
{
	email $EMAIL
}

$SITE_LIST {
	encode zstd gzip

	# Всё — на сервер в офисе через SSH-туннель. Caddy сам передаёт X-Forwarded-For
	# с настоящим адресом клиента, WebSocket работает без доп. настроек,
	# ограничения времени ответа нет (долгие ответы ассистента не обрываются).
	reverse_proxy 127.0.0.1:$TUNNEL_PORT {
		transport http {
			dial_timeout 5s
		}
	}

	header {
		Strict-Transport-Security "max-age=31536000"
		-Server
	}

	# Свои ошибки Caddy выдаёт только когда сервер в офисе недоступен
	# (404 и прочие отдаёт сам сервер Offix и они проходят как есть).
	handle_errors {
		@api path /api/* /socket.io/*
		handle @api {
			header Content-Type "application/json; charset=utf-8"
			respond \`{"error":"Сервер компании временно недоступен. Попробуйте через минуту."}\` 503
		}
		# Страница без фигурных скобок: в Caddyfile они означают подстановки.
		handle {
			header Content-Type "text/html; charset=utf-8"
			respond \`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="20"><title>Offix — сервер недоступен</title></head><body style="margin:0;font-family:system-ui,sans-serif;background:#f4f4f0;color:#1d1d1f"><div style="max-width:420px;margin:18vh auto 0;padding:24px;text-align:center"><h1 style="font-size:22px">Сервер компании временно недоступен</h1><p style="color:#6b6b70;line-height:1.5">Обычно это занимает минуту-две: сервер перезагружается или восстанавливается связь. Страница обновится сама.</p></div></body></html>\` 503
		}
	}

	log {
		output file /var/log/caddy/access.log {
			roll_size 20mb
			roll_keep 5
		}
	}
}
CONF
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 || { caddy validate --config /etc/caddy/Caddyfile; die "Ошибка в Caddyfile"; }
# Проверка конфига выше запускается от root и создаёт файл журнала с владельцем root —
# после этого Caddy (пользователь caddy) не смог бы его открыть.
chown -R caddy:caddy /var/log/caddy
systemctl enable caddy >/dev/null
systemctl restart caddy
sleep 2
systemctl is-active --quiet caddy || { journalctl -u caddy -n 20 --no-pager; die "Caddy не запустился — см. журнал выше"; }
ok "Caddy обслуживает: $SITE_LIST"

step "Команды обслуживания"
cat > /usr/local/sbin/offix-allow-office <<'SCRIPT'
#!/usr/bin/env bash
# Разрешить серверу в офисе открыть туннель. Использование:
#   sudo offix-allow-office 'ssh-ed25519 AAAA... offix-office-tunnel'
set -euo pipefail
KEY="${1:-}"
PORT="$(cat /etc/offix-tunnel-port)"
[[ "$KEY" =~ ^ssh-ed25519\ [A-Za-z0-9+/=]+(\ .*)?$ ]] || { echo "Это не ключ ssh-ed25519. Скопируйте строку целиком из окна PowerShell." >&2; exit 1; }
# Ключ может только открыть туннель на один порт: без командной строки, без других пробросов.
echo "restrict,port-forwarding,permitlisten=\"127.0.0.1:$PORT\" $KEY" > /home/offix-tunnel/.ssh/authorized_keys
chown offix-tunnel:offix-tunnel /home/offix-tunnel/.ssh/authorized_keys
chmod 600 /home/offix-tunnel/.ssh/authorized_keys
echo "OK: ключ офиса установлен (прежний, если был, заменён). Туннель может подключаться."
SCRIPT
cat > /usr/local/sbin/offix-status <<'SCRIPT'
#!/usr/bin/env bash
# Состояние «входной двери»: службы, туннель из офиса, ответ сервера.
PORT="$(cat /etc/offix-tunnel-port)"
for s in caddy ssh fail2ban; do printf '%-10s %s\n' "$s" "$(systemctl is-active "$s")"; done
if ss -ltn "sport = :$PORT" | grep -q LISTEN; then
  echo "туннель   подключён (127.0.0.1:$PORT)"
  printf 'сервер    '; curl -s -m 5 "http://127.0.0.1:$PORT/api/health" || echo 'не отвечает'; echo
else
  echo "туннель   НЕ подключён — проверьте службу OffixTunnel на сервере в офисе"
fi
echo "последние подключения туннеля:"
journalctl -u ssh --since '-1 day' --no-pager 2>/dev/null | grep -E 'offix-tunnel' | tail -5
SCRIPT
chmod 755 /usr/local/sbin/offix-allow-office /usr/local/sbin/offix-status
ok "offix-allow-office, offix-status"

HOSTKEY=$(awk '{print $1" "$2}' /etc/ssh/ssh_host_ed25519_key.pub)
IP=$(curl -fsS -4 --max-time 5 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')

printf '\n\033[1;32m===== Готово =====\033[0m\n'
cat <<TXT

Внешний IP этого сервера: $IP
В DNS (Cloudflare) для доменов [$SITE_LIST]: запись A -> $IP, облачко СЕРОЕ (DNS only).

Дальше — на Windows-сервере в офисе, PowerShell от имени администратора:

  powershell -ExecutionPolicy Bypass -File C:\\mesNation\\deploy\\windows\\install-tunnel.ps1 -VpsHost $IP -HostKey "$HOSTKEY"

Скрипт выведет ключ офиса и команду вида  sudo offix-allow-office '...'  — выполните её здесь.
Проверка в любой момент:  sudo offix-status
TXT
