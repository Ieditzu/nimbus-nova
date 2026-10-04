#!/bin/sh
# Vlad's acceptance sequence against a running API. Does not start a second server.
set -eu
base="${1:-http://127.0.0.1:8080}"
fail() { printf 'FAIL %s\n' "$1" >&2; exit 1; }
get() { curl -fsS "$base$1"; }
post() {
  actor="$1"
  path="$2"
  body="$3"
  curl -fsS -X POST "$base$path" -H 'Content-Type: application/json' -H "X-Demo-Actor: $actor" -d "$body"
}

get /health | grep -q '"ok":true' || fail 'health'
get /v1/tasks | grep -q 'task_seed_event_setup' || fail 'seed list'
get /v1/tasks/task_seed_event_setup | grep -q '"status":"open"' || fail 'seed task'
code=$(curl -s -o /tmp/nova-smoke-body -w '%{http_code}' -X POST "$base/v1/tasks/task_seed_event_setup/applications" -H 'Content-Type: application/json' -d '{"message":"Pot ajunge la 13:45 și ajut la amenajare."}')
[ "$code" = "401" ] || fail "missing actor $code"
post worker-1 /v1/tasks/task_seed_event_setup/applications '{"message":"Pot ajunge la 13:45 și ajut la amenajare."}' > /tmp/nova-smoke-apply
grep -q '"status":"pending"' /tmp/nova-smoke-apply || fail 'apply'
id=$(sed -n 's/.*"id":"\(app_[0-9a-f]*\)".*/\1/p' /tmp/nova-smoke-apply | head -1)
[ -n "$id" ] || fail 'application id'
post poster-1 "/v1/applications/$id/accept" '{}' | grep -q '"assignee_id":"worker-1"' || fail 'accept'
post poster-1 /v1/tasks/task_seed_event_setup/complete '{}' | grep -q '"status":"completed"' || fail 'complete'
post admin-1 /v1/admin/tasks/task_seed_shop_cover/hide '{}' | grep -q '"status":"hidden"' || fail 'hide'
code=$(curl -s -o /dev/null -w '%{http_code}' "$base/v1/tasks/task_seed_shop_cover")
[ "$code" = "404" ] || fail "hidden still public $code"
post admin-1 /v1/demo/reset '{}' | grep -q '"ok":true' || fail 'reset'
get /v1/tasks | grep -q 'task_seed_shop_cover' || fail 'reset list'
printf 'OK demo sequence against %s\n' "$base"
