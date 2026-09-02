#!/usr/bin/env bash
# 已合并到项目根目录的 ./start-dev.sh，本脚本仅作兼容转发。
exec "$(cd "$(dirname "$0")/.." && pwd)/start-dev.sh" "$@"
