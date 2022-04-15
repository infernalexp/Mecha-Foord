// PM2 configuration file
module.exports = {
  apps: [
    {
      name: "mechafoord",
      script: "dist/index.js",
      args: "",
      watch: false,
      exec_mode: "fork",
      instances: "1",
      max_memory_restart: "256M",
      min_uptime: 8000,
      listen_timeout: 6000,
      cron_restart: "0 0 * * *",
    },
  ],
};
