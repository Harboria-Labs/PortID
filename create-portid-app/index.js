#!/usr/bin/env node
/**
 * create-portid-app
 * 
 * Scaffolds a new app with PortID encrypted sync built in.
 * Usage: npx create-portid-app my-app
 */

import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const args = process.argv.slice(2);
const appName = args[0] || 'my-portid-app';
const serverUrl = args.find(a => a.startsWith('--server='))?.split('=')[1] || 'https://sync.portid.dev';

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
  create-portid-app — Scaffold a new app with PortID encrypted sync

  Usage:
    npx create-portid-app <app-name> [--server=https://your-server.com]

  Examples:
    npx create-portid-app my-notes-app
    npx create-portid-app my-app --server=https://my-sync.railway.app
  `);
  process.exit(0);
}

console.log(`\n🔐 Creating PortID app: ${appName}\n`);

const dir = join(process.cwd(), appName);
if (existsSync(dir)) {
  console.error(`  ✗ Directory "${appName}" already exists.`);
  process.exit(1);
}

mkdirSync(dir, { recursive: true });
mkdirSync(join(dir, 'src'), { recursive: true });

// package.json
writeFileSync(join(dir, 'package.json'), JSON.stringify({
  name: appName,
  version: '0.1.0',
  type: 'module',
  scripts: {
    dev: 'vite',
    build: 'vite build',
    preview: 'vite preview',
  },
  dependencies: {
    '@harboria-labs/portid-js-sdk': '^0.2.0',
    '@harboria-labs/portid-ui': '^0.2.0',
  },
  devDependencies: {
    vite: '^5.0.0',
  },
}, null, 2));

// index.html
writeFileSync(join(dir, 'index.html'), `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${appName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, system-ui, sans-serif; background: #0f0f1a; color: #e0e0e0; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    #app { width: 100%; max-width: 400px; padding: 20px; }
    #data-view { margin-top: 24px; padding: 16px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; display: none; }
    #data-view h3 { font-size: 14px; margin-bottom: 12px; }
    #data-view textarea { width: 100%; height: 120px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: inherit; padding: 10px; font-size: 13px; resize: vertical; }
    #data-view button { margin-top: 8px; padding: 8px 16px; background: #6366f1; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 13px; }
  </style>
</head>
<body>
  <div id="app">
    <portid-login app-id="${appName}" server="${serverUrl}"></portid-login>
    <div id="data-view">
      <h3>📝 Your encrypted data:</h3>
      <textarea id="user-data" placeholder="Type anything here — it's encrypted before leaving your device"></textarea>
      <button onclick="saveData()">💾 Save (encrypted backup)</button>
      <p id="save-status" style="margin-top:8px; font-size:11px; opacity:0.5;"></p>
    </div>
  </div>
  <script type="module" src="./src/main.js"></script>
</body>
</html>
`);

// src/main.js
writeFileSync(join(dir, 'src/main.js'), `import '@harboria-labs/portid-ui';
import PortID from '@harboria-labs/portid-js-sdk';

const sdk = new PortID('${appName}', '${serverUrl}');
const dataView = document.getElementById('data-view');
const textarea = document.getElementById('user-data');
const status = document.getElementById('save-status');

// Listen for login/signup events from the PortID component
document.querySelector('portid-login').addEventListener('portid-login', async (e) => {
  console.log('Logged in:', e.detail.username);
  dataView.style.display = 'block';
  
  // Load existing data
  try {
    const data = await sdk.loadData();
    if (data?.userContent) {
      textarea.value = data.userContent;
    }
  } catch (err) {
    console.log('No existing data or first login');
  }
});

document.querySelector('portid-login').addEventListener('portid-signup', (e) => {
  console.log('Signed up:', e.detail.username);
  console.log('Recovery key:', e.detail.recoveryKey);
  dataView.style.display = 'block';
});

document.querySelector('portid-login').addEventListener('portid-restore', (e) => {
  console.log('Restored:', e.detail.data);
  dataView.style.display = 'block';
  if (e.detail.data?.userContent) {
    textarea.value = e.detail.data.userContent;
  }
});

// Save function (called from HTML button)
window.saveData = async function() {
  status.textContent = 'Encrypting & backing up...';
  try {
    const hash = await sdk.backupData({ userContent: textarea.value, savedAt: Date.now() });
    status.textContent = \`✓ Saved! Hash: \${hash.slice(0, 12)}...\`;
  } catch (err) {
    status.textContent = \`✗ \${err.message}\`;
  }
};
`);

// .gitignore
writeFileSync(join(dir, '.gitignore'), 'node_modules\ndist\n.env\n');

console.log(`  ✓ Created ${dir}/`);
console.log(`  ✓ package.json`);
console.log(`  ✓ index.html (with <portid-login> component)`);
console.log(`  ✓ src/main.js (SDK integration)`);
console.log(`\n  Next steps:\n`);
console.log(`    cd ${appName}`);
console.log(`    npm install`);
console.log(`    npm run dev\n`);
console.log(`  🔐 Server: ${serverUrl}`);
console.log(`  📖 Docs: https://github.com/Harboria-Labs/PortID\n`);
