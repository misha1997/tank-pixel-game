// PM2 process file for production. Run `npm run deploy` (build + migrate +
// pm2 startOrReload) or `pm2 start ecosystem.config.cjs` directly.
//
// server/.env must exist (copy from server/.env.example) with a real
// DATABASE_URL and SESSION_SECRET — server/src/index.ts loads it via
// dotenv/config, which reads from the process's cwd, hence cwd below.
module.exports = {
  apps: [
    {
      name: 'tank-server',
      script: 'dist/index.js',
      cwd: './server',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
