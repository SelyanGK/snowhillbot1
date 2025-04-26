const express = require('express');
const { spawn } = require('child_process');

const app = express();
const port = process.env.PORT || 3000;

// Express app for keep-alive
app.get('/', (req, res) => {
  res.send('Bot is alive and running!');
});

let bot;

// Function to start the bot
function startBot() {
  bot = spawn('npx', ['ts-node', 'server/index.ts'], { stdio: 'inherit' });

  bot.on('exit', (code, signal) => {
    console.error(`Bot exited with code ${code} and signal ${signal}`);
    console.log('Restarting bot in 5 seconds...');
    setTimeout(startBot, 5000); // Wait 5 seconds before restarting
  });

  bot.on('error', (err) => {
    console.error('Failed to start bot:', err);
    console.log('Retrying to start bot in 5 seconds...');
    setTimeout(startBot, 5000);
  });
}

// Start first bot
startBot();

// Start express server
app.listen(port, () => {
  console.log(`Keep-alive server listening on port ${port}`);
});