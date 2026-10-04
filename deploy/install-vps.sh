#!/bin/sh
set -eu
cd /opt/nimbus-nova
mkdir -p /etc/nginx/ssl
openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
  -keyout /etc/nginx/ssl/nimbusnova.cc.key \
  -out /etc/nginx/ssl/nimbusnova.cc.crt \
  -subj "/CN=nimbusnova.cc" \
  -addext "subjectAltName=DNS:nimbusnova.cc,DNS:www.nimbusnova.cc,DNS:app.nimbusnova.cc,DNS:admin.nimbusnova.cc,DNS:api.nimbusnova.cc"
install -m 644 deploy/nginx-vps.conf /etc/nginx/sites-available/nimbusnova
ln -sfn /etc/nginx/sites-available/nimbusnova /etc/nginx/sites-enabled/nimbusnova
nginx -t
COMPOSE_PARALLEL_LIMIT=1 docker compose -f deploy/docker-compose.yml up -d --build
systemctl reload nginx
wget -q -O - http://127.0.0.1:8091/health
echo
wget -q -O /dev/null http://127.0.0.1:8090/
wget -q -O /dev/null http://127.0.0.1:8092/
echo DEPLOY_OK
