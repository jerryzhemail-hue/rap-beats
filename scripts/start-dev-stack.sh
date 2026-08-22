#!/usr/bin/env bash
# 一次确认所有本地开发服务是否活着
#   ./scripts/start-dev-stack.sh
#
# 会按顺序做：
#   1) 确保 Homebrew MySQL (3306) 已起
#   2) 确保 colima Docker daemon 已起，dev mysql 容器 (3307) 在跑
#   3) 启动后端 (3000)、前端 (5173)
#
# 任何一步失败就停下来给你看。

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
blue()  { printf '\033[34m%s\033[0m\n' "$*"; }

port_listening() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

wait_for_port() {
  local port="$1" name="$2" timeout="${3:-30}"
  for i in $(seq 1 "$timeout"); do
    if port_listening "$port"; then
      green "✅ $name on port $port up (after ${i}s)"
      return 0
    fi
    sleep 1
  done
  red "❌ $name on port $port not up within ${timeout}s"
  return 1
}

start_backend() {
  if port_listening 3000; then
    green "✅ backend already on 3000"
    return 0
  fi
  blue "→ starting backend (npm run dev in server/)"
  (cd "$ROOT/server" && nohup npm run dev >/tmp/rap-beats-server.log 2>&1 &)
  wait_for_port 3000 "backend"
}

start_frontend() {
  if port_listening 5173; then
    green "✅ frontend already on 5173"
    return 0
  fi
  blue "→ starting frontend (npm run dev in client/, --host 0.0.0.0)"
  (cd "$ROOT/client" && nohup npm run dev -- --host 0.0.0.0 >/tmp/rap-beats-client.log 2>&1 &)
  wait_for_port 5173 "frontend"
}

ensure_mysql_brew() {
  if port_listening 3306; then
    green "✅ brew mysql on 3306"
    return 0
  fi
  blue "→ brew mysql not running, attempting brew services start mysql"
  brew services start mysql >/dev/null 2>&1 || true
  wait_for_port 3306 "brew mysql"
}

ensure_colima() {
  if colima status >/dev/null 2>&1; then
    green "✅ colima daemon running"
    return 0
  fi
  blue "→ colima not running, starting (this can take 15-30s)"
  colima start >/dev/null 2>&1
  green "✅ colima started"
}

ensure_dev_mysql_container() {
  if port_listening 3307; then
    green "✅ dev mysql container already on 3307"
    return 0
  fi
  blue "→ starting rap-beats-dev-mysql (colima daemon)"
  docker compose --project-directory "$ROOT" -f "$ROOT/docker-compose.dev.yml" up -d mysql >/dev/null 2>&1
  wait_for_port 3307 "dev mysql" 60
}

main() {
  blue "🐳 rap-beats local stack bootstrapper"
  echo
  ensure_mysql_brew
  ensure_colima
  ensure_dev_mysql_container
  start_backend
  start_frontend
  echo
  green "🎉 Stack ready"
  echo "  backend  http://localhost:3000"
  echo "  frontend http://localhost:5173"
  echo "  dev mysql 127.0.0.1:3307   user=dev_user pass=dev_pass_2024"
  echo "  brew mysql 127.0.0.1:3306  user=root    pass=wangzhe@Q5!2024"
}

main "$@"
