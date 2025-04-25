// start-dev.js (ESM-compatible version)
import { spawn } from 'child_process';

// Start the TypeScript bot with ts-node-esm
const proc = spawn('npx', ['ts-node-esm', 'server/index.ts'], {
  stdio: 'inherit',  // This makes sure all console output from the bot shows up in the terminal
  shell: true        // This is necessary to ensure shell compatibility
});

// Handling process exit
proc.on('close', (code) => {
  console.log(`Bot process exited with code ${code}`);
});