module.exports = {
  apps: [
    {
      name: 'rap-beats-server',
      script: 'dist/index.js',
      cwd: '/opt/rap-beats/server',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      // pm2 自动根据系统 init 脚本配置开机自启
      // 运行: pm2 startup（交互式）后 pm2 save
      //
      // 日志配置
      log_file: '/var/log/rap-beats/server.log',
      out_file: '/var/log/rap-beats/server-out.log',
      error_file: '/var/log/rap-beats/server-err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // 超过以下阈值重启（防止内存泄漏）
      max_restarts: 10,
      min_uptime: '10s',
      // 优雅停止（给 Node.js 进程 SIGTERM 信号）
      kill_timeout: 5000,
      listen_timeout: 10000,
    },
  ],
};
