#!/bin/sh
set -eu
if [ "${SSH_ORIGINAL_COMMAND:-}" != "deploy" ]; then
  echo denied >&2
  exit 1
fi
mkdir -p /opt/nimbus-nova
tar -C /opt/nimbus-nova -xzf -
exec /opt/nimbus-nova/deploy/install-vps.sh
