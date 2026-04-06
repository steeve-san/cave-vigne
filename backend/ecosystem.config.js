// ecosystem.config.js — PM2
module.exports = {
  apps: [{
    name: 'cave-vigne-api',
    script: 'src/server.js',
    cwd: '/var/www/cave-vigne/backend',
    instances: 'max',        // cluster mode — 1 instance par CPU
    exec_mode: 'cluster',
    max_memory_restart: '250M',
    env: { NODE_ENV: 'production' },
    error_file: '/var/log/pm2/cave-vigne-error.log',
    out_file: '/var/log/pm2/cave-vigne-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    watch: false,
    autorestart: true,
    restart_delay: 3000,
    exp_backoff_restart_delay: 100,
  }]
};
