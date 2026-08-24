# Rap Beats 监控台（本地 dev 环境）

轻量本地监控服务，零外部依赖（只用 Node 内置模块），通过 launchd 常驻。
当前**只监控本地 dev 开发环境**。

## 访问

- Dashboard：http://127.0.0.1:4000
- 数据接口：`/api/overview`、`/api/health`

## 管理

```bash
./monitor/ctl.sh start     # 启动（launchd 常驻 + 崩溃自拉起）
./monitor/ctl.sh stop      # 停止
./monitor/ctl.sh status    # 状态
./monitor/ctl.sh logs      # 看监控服务自身日志
```

## 监控内容（本地 dev）

| 分组 | 目标 | 方式 |
|---|---|---|
| 本地服务 | 后端 API（3000 `/api/health`） | HTTP 探活，识别 503 降级 |
| 本地服务 | 前端（5173） | HTTP 探活 |
| 本地依赖 | MySQL（3307） | TCP 连通 |

## 报错日志

监控台“报错日志”面板聚合本地日志：

- 后端日志：`/tmp/rap-beats-server.log`（launchd 后端实时输出）
- 前端日志：`logs/frontend.log`（可选）
- 部署日志：`logs/deploy.log`（可选）

匹配规则：`error / fatal / throw / unhandled / rejected / failed / 5xx / ECONNREFUSED ...` 等。

### 让前端 / 部署日志进文件

前端（Vite）和部署脚本默认只打印到终端，想被监控采集就重定向到文件：

```bash
# 前端
cd client && npm run dev > ../logs/frontend.log 2>&1 &

# 部署（本地示例）
./deploy.sh local 2>&1 | tee logs/deploy.log
```

## 配置

全部在 `monitor/config.json`：

- `port`：监控台端口（默认 4000，避开 ClashX 的 9090）
- `fastIntervalSec`：检查间隔（默认 15s）
- `targets`：HTTP / TCP 探活目标
- `logs`：本地日志文件（`optional: true` 表示文件不存在不告警）

改完配置重启：`./monitor/ctl.sh stop && ./monitor/ctl.sh start`

## 恢复生产监控（以后需要时）

`monitor/config.json` 里：

1. 把 `ssh.enabled` 改回 `true`；
2. 在 `targets` 里加回生产探活目标：

```json
{
  "id": "prod-web",
  "name": "生产前端 (Nginx)",
  "group": "生产部署",
  "type": "http",
  "url": "http://47.85.98.237/",
  "expectStatus": 200,
  "timeoutMs": 6000,
  "slow": true
}
```

然后 `./monitor/ctl.sh stop && ./monitor/ctl.sh start`。

## 状态持久化

累计在线率、事件时间线存在 `monitor/state.json`，服务重启不丢。

## 与后端的关系

监控服务独立于后端运行，后端挂了它照样能记录「后端 down」并展示在后端日志/事件里。它自己由 launchd 托管，端口 4000。
