/**
 * Starts a localtunnel to expose localhost:3000 publicly.
 * Prints the public URL and instructions to update .env + Shopify Partners.
 *
 * Run: npm run tunnel  (or npm run dev:live to start server + tunnel together)
 */
import localtunnel from 'localtunnel';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const PORT = parseInt(process.env.PORT || '3000', 10);

console.log(`\n🌐 Opening tunnel to localhost:${PORT}...\n`);

const tunnel = await localtunnel({ port: PORT, subdomain: 'multi-currency-converter' });

const url = tunnel.url;
console.log('═══════════════════════════════════════════════════════');
console.log(`  PUBLIC URL:  ${url}`);
console.log('═══════════════════════════════════════════════════════');
console.log('');
console.log('Next steps:');
console.log(`  1. Update .env  →  HOST=${url}`);
console.log(`  2. Shopify Partners → App setup:`);
console.log(`       App URL:            ${url}`);
console.log(`       Redirect URL:       ${url}/api/auth/callback`);
console.log(`  3. Restart the server (npm run dev)`);
console.log(`  4. Install URL:  ${url}/api/auth/install?shop=YOUR_STORE.myshopify.com`);
console.log('');

// Auto-update .env if HOST line exists
try {
  const envPath = resolve(process.cwd(), '.env');
  let env = readFileSync(envPath, 'utf8');
  if (env.includes('HOST=')) {
    env = env.replace(/^HOST=.*/m, `HOST=${url}`);
    writeFileSync(envPath, env);
    console.log(`  ✅ .env updated automatically — HOST set to ${url}`);
  }
} catch {
  // .env not found — that's fine
}

tunnel.on('close', () => {
  console.log('\n🔌 Tunnel closed.');
  process.exit(0);
});

process.on('SIGINT', () => {
  tunnel.close();
});
