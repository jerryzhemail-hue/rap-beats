#!/usr/bin/env bash
# scripts/restart-server.sh — 在 Mac 终端执行此脚本即可重启后端
#
# Cursor IDE 自带的 shell 是 sandbox 的,跑不了持久进程。
# 后端必须由 macOS 上你自己打开的 Terminal.app / iTerm2 启动。

set -e

cd "$(dirname "$0")/../server"

echo "==> 杀掉旧后端进程"
pkill -f "tsx/esm src/index.ts" 2>/dev/null && sleep 1 || true

echo "==> 加载 .env 并启动后端 (使用 npm-run-all 让日志实时输出)"
set -a
. ./.env
set +a

exec npm run dev