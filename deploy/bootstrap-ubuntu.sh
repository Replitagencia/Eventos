#!/usr/bin/env bash
set -euo pipefail
# Ejecutar únicamente en la máquina nueva y dedicada de Eventos, por SSH con clave.
test "$(id -u)" = 0
. /etc/os-release
test "$ID" = ubuntu && test "$VERSION_ID" = 24.04
if [ -d /opt/bicevida ]; then
  echo 'Este instalador requiere el servidor exclusivo de Eventos.' >&2
  exit 1
fi
if [ -z "${SSH_CONNECTION:-}" ]; then
  echo 'Se requiere una sesión SSH para habilitar su dirección en el firewall.' >&2
  exit 1
fi
EVENTOS_ADMIN_IP="${SSH_CONNECTION%% *}"
cloud-init status --wait
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y ca-certificates curl ufw
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
apt-get update -qq
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
install -d -m 0755 /opt/eventos
install -d -o 1000 -g 1000 -m 0700 /opt/eventos/backups
ufw default deny incoming
ufw default allow outgoing
ufw allow from "$EVENTOS_ADMIN_IP" to any port 22 proto tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
cat > /etc/ssh/sshd_config.d/00-eventos.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
sshd -t
systemctl reload ssh
docker version --format '{{.Server.Version}}'
ufw status
