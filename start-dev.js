{
  "scripts": {
    "dev": "node start-dev.js",  // Utilisation du script start-dev.js en développement
    "start": "ts-node server/index.ts",  // Démarrage du bot en mode production avec ts-node
    "build": "echo 'Pas de build nécessaire pour ce bot.'",
    "check": "tsc --noEmit"
  },
  "dependencies": {
    "discord.js": "^14.18.0",
    "ts-node": "^10.0.0",
    "typescript": "^4.5.0"
  }
}