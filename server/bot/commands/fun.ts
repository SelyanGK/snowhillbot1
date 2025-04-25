import { Command, getCommandPrefix } from '../utils';
import { CommandCategory } from '@shared/schema';
import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import axios from 'axios';

// Fun commands collection
// Enhanced 8ball command with categories of responses
const eightBallResponses = {
  positive: [
    'It is certain.', 'It is decidedly so.', 'Without a doubt.',
    'Yes definitely.', 'You may rely on it.', 'As I see it, yes.',
    'Most likely.', 'Outlook good.', 'Yes.', 'Signs point to yes.'
  ],
  neutral: [
    'Reply hazy, try again.', 'Ask again later.', 'Better not tell you now.',
    'Cannot predict now.', 'Concentrate and ask again.'
  ],
  negative: [
    'Don\'t count on it.', 'My reply is no.', 'My sources say no.',
    'Outlook not so good.', 'Very doubtful.'
  ]
};

// Rock-paper-scissors choices and rules
const rpsChoices = ['rock', 'paper', 'scissors'];
const rpsRules = {
  rock: { beats: 'scissors', losesTo: 'paper' },
  paper: { beats: 'rock', losesTo: 'scissors' },
  scissors: { beats: 'paper', losesTo: 'rock' }
};

// Word list for hangman game
const hangmanWords = [
  'discord', 'server', 'bot', 'community', 'gaming',
  'snowhill', 'chat', 'voice', 'friends', 'emotes',
  'streaming', 'nitro', 'microphone', 'headset', 'webcam',
  'memes', 'moderator', 'roles', 'commands', 'channel'
];

// ASCII art for hangman stages
const hangmanStages = [
  `
  +---+
  |   |
      |
      |
      |
      |
=========`,
  `
  +---+
  |   |
  O   |
      |
      |
      |
=========`,
  `
  +---+
  |   |
  O   |
  |   |
      |
      |
=========`,
  `
  +---+
  |   |
  O   |
 /|   |
      |
      |
=========`,
  `
  +---+
  |   |
  O   |
 /|\\  |
      |
      |
=========`,
  `
  +---+
  |   |
  O   |
 /|\\  |
 /    |
      |
=========`,
  `
  +---+
  |   |
  O   |
 /|\\  |
 / \\  |
      |
=========`
];

// Random facts
const randomFacts = [
  'A day on Venus is longer than a year on Venus.',
  'The shortest war in history was between Britain and Zanzibar in 1896. It lasted only 38 minutes.',
  'A group of flamingos is called a "flamboyance".',
  'The world\'s oldest known living tree is over 5,000 years old.',
  'Honey never spoils. Archaeologists have found pots of honey in ancient Egyptian tombs that are over 3,000 years old and still perfectly good to eat.',
  'The unicorn is Scotland\'s national animal.',
  'A bolt of lightning is five times hotter than the surface of the sun.',
  'The average person walks the equivalent of three times around the world in a lifetime.',
  'The world\'s largest desert is Antarctica, not the Sahara.',
  'A blue whale\'s heart is so big that a human could swim through its arteries.',
  'Octopuses have three hearts.',
  'Cats can\'t taste sweet things.',
  'The Hawaiian alphabet has only 12 letters.',
  'A hummingbird weighs less than a penny.',
  'It would take about 1.2 million mosquitoes, each sucking once, to completely drain the average human of blood.'
];

// Dad jokes
const dadJokes = [
  'I told my wife she was drawing her eyebrows too high. She looked surprised.',
  'Why don\'t scientists trust atoms? Because they make up everything!',
  'What did the buffalo say to his son when he left for college? Bison!',
  'How do you organize a space party? You planet!',
  'I\'m reading a book about anti-gravity. It\'s impossible to put down!',
  'Did you hear about the mathematician who\'s afraid of negative numbers? He\'ll stop at nothing to avoid them!',
  'Why don\'t skeletons fight each other? They don\'t have the guts.',
  'What do you call a fake noodle? An impasta!',
  'How do you make a tissue dance? Put a little boogie in it!',
  'Why did the scarecrow win an award? Because he was outstanding in his field!',
  'I would tell you a joke about construction, but I\'m still working on it.',
  'Why don\'t eggs tell jokes? They\'d crack each other up.',
  'I used to be a baker, but I couldn\'t make enough dough.',
  'What\'s brown and sticky? A stick.',
  'Why did the bicycle fall over? Because it was two tired!'
];

// Reminder tracking (in-memory for simplicity)
const activeReminders = new Map<string, NodeJS.Timeout>();

export const funCommands: Command[] = [
  // New Reminder command
  {
    name: 'reminder',
    description: 'Sets a reminder for a specified time in the future',
    usage: '+reminder [time in minutes] [reminder text]',
    aliases: ['remind', 'remindme'],
    category: CommandCategory.FUN,
    cooldown: 5,
    requiredPermissions: [],
    execute: async (message, args) => {
      // Validate arguments
      if (args.length < 2) {
        return message.reply('Please provide a time in minutes and a message. Example: `+reminder 10 Take a break`');
      }
      
      // Parse minutes
      const minutes = parseInt(args[0]);
      if (isNaN(minutes) || minutes <= 0 || minutes > 1440) { // max 24 hours (1440 minutes)
        return message.reply('Please provide a valid time in minutes (between 1 and 1440).');
      }
      
      // Get reminder text
      const reminderText = args.slice(1).join(' ');
      
      // Create unique ID for this reminder
      const reminderId = `${message.author.id}-${Date.now()}`;
      
      // Create embed for confirmation
      const confirmEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('⏰ Reminder Set')
        .setDescription(`I'll remind you about "${reminderText}" in ${minutes} minute${minutes !== 1 ? 's' : ''}.`)
        .setFooter({ text: `Requested by ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
        .setTimestamp();
      
      await message.reply({ embeds: [confirmEmbed] });
      
      // Set timeout for the reminder
      const timeout = setTimeout(async () => {
        try {
          // Create reminder embed
          const reminderEmbed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('⏰ Reminder')
            .setDescription(`You asked me to remind you: "${reminderText}"`)
            .setFooter({ text: `Reminder set ${minutes} minute${minutes !== 1 ? 's' : ''} ago` })
            .setTimestamp();
          
          // Try to DM the user first
          try {
            await message.author.send({ embeds: [reminderEmbed] });
          } catch (err) {
            // If DM fails, send in the channel where it was requested
            await message.channel.send({ 
              content: `<@${message.author.id}>, here's your reminder:`,
              embeds: [reminderEmbed] 
            });
          }
          
          // Clean up the reminder
          activeReminders.delete(reminderId);
        } catch (error) {
          console.error('Error sending reminder:', error);
        }
      }, minutes * 60 * 1000);
      
      // Store the timeout reference
      activeReminders.set(reminderId, timeout);
    }
  },
  
  // 1. 8ball command
  {
    name: '8ball',
    description: 'Ask the magic 8-ball a question and receive your fortune',
    usage: '+8ball [question]', // getCommandPrefix will handle this dynamically
    category: CommandCategory.FUN,
    cooldown: 5,
    requiredPermissions: [],
    execute: async (message, args) => {
      if (!args.length) {
        return message.reply('You need to ask a question!');
      }

      const responses = [
        'It is certain.',
        'It is decidedly so.',
        'Without a doubt.',
        'Yes - definitely.',
        'You may rely on it.',
        'As I see it, yes.',
        'Most likely.',
        'Outlook good.',
        'Yes.',
        'Signs point to yes.',
        'Reply hazy, try again.',
        'Ask again later.',
        'Better not tell you now.',
        'Cannot predict now.',
        'Concentrate and ask again.',
        'Don\'t count on it.',
        'My reply is no.',
        'My sources say no.',
        'Outlook not so good.',
        'Very doubtful.'
      ];

      const response = responses[Math.floor(Math.random() * responses.length)];
      
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🎱 Magic 8-Ball')
        .addFields(
          { name: 'Question', value: args.join(' ') },
          { name: 'Answer', value: response }
        )
        .setFooter({ text: 'The Magic 8-Ball has spoken!' });

      return message.reply({ embeds: [embed] });
    }
  },

  // 2. Joke command
  {
    name: 'joke',
    description: 'Tells a random joke to lighten the mood',
    usage: '+joke [category]', // getCommandPrefix will handle this dynamically
    aliases: ['jokes', 'funny'],
    category: CommandCategory.FUN,
    cooldown: 5,
    requiredPermissions: [],
    execute: async (message, args) => {
      let category = args[0]?.toLowerCase() || 'any';
      
      // Valid joke categories
      const validCategories = ['any', 'programming', 'misc', 'dark', 'pun', 'spooky', 'christmas'];
      
      if (!validCategories.includes(category)) {
        category = 'any';
      }
      
      try {
        // Use the JokeAPI
        const url = `https://v2.jokeapi.dev/joke/${category === 'any' ? 'Any' : category}?blacklistFlags=nsfw,religious,political,racist,sexist,explicit`;
        const response = await axios.get(url);
        
        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('😂 Joke Time!')
          .setFooter({ text: `Category: ${category.charAt(0).toUpperCase() + category.slice(1)}` });
        
        if (response.data.type === 'single') {
          embed.setDescription(response.data.joke);
        } else {
          embed.addFields(
            { name: 'Setup', value: response.data.setup },
            { name: 'Punchline', value: `||${response.data.delivery}||` }
          );
        }
        
        return message.reply({ embeds: [embed] });
      } catch (error) {
        console.error('Error fetching joke:', error);
        return message.reply('Failed to fetch a joke. Please try again later.');
      }
    }
  },

  // 3. Coin flip command
  {
    name: 'coinflip',
    description: 'Flips a coin and shows the result',
    usage: '+coinflip', // getCommandPrefix will handle this dynamically
    aliases: ['flip', 'coin'],
    category: CommandCategory.FUN,
    cooldown: 3,
    requiredPermissions: [],
    execute: async (message) => {
      const result = Math.random() < 0.5 ? 'Heads' : 'Tails';
      
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🪙 Coin Flip')
        .setDescription(`The coin landed on: **${result}**!`);
      
      return message.reply({ embeds: [embed] });
    }
  },

  // 4. Roll dice command
  {
    name: 'roll',
    description: 'Rolls dice in DnD notation (e.g., 2d6)',
    usage: '+roll [dice notation, default: 1d6]', // getCommandPrefix will handle this dynamically
    aliases: ['dice', 'diceroll'],
    category: CommandCategory.FUN,
    cooldown: 3,
    requiredPermissions: [],
    execute: async (message, args) => {
      let notation = args.length ? args[0].toLowerCase() : '1d6';
      
      // Parse dice notation
      const diceRegex = /^(\d+)d(\d+)$/i;
      const match = notation.match(diceRegex);
      
      if (!match) {
        return message.reply('Invalid dice notation. Use format like `1d6`, `2d20`, etc.');
      }
      
      const numDice = parseInt(match[1]);
      const numSides = parseInt(match[2]);
      
      // Validate input
      if (numDice < 1 || numDice > 100) {
        return message.reply('Number of dice must be between 1 and 100.');
      }
      
      if (numSides < 2 || numSides > 1000) {
        return message.reply('Number of sides must be between 2 and 1000.');
      }
      
      // Roll the dice
      const results = [];
      let total = 0;
      
      for (let i = 0; i < numDice; i++) {
        const roll = Math.floor(Math.random() * numSides) + 1;
        results.push(roll);
        total += roll;
      }
      
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🎲 Dice Roll')
        .setDescription(`Rolling **${notation}**...`)
        .addFields(
          { name: 'Results', value: results.join(', ') },
          { name: 'Total', value: total.toString() }
        );
      
      return message.reply({ embeds: [embed] });
    }
  },

  // 5. Meme command
  {
    name: 'meme',
    description: 'Sends a random meme from Reddit',
    usage: '+meme [subreddit]',
    category: CommandCategory.FUN,
    cooldown: 10,
    requiredPermissions: [],
    execute: async (message, args) => {
      let subreddit = args[0] || 'memes';
      
      // Remove r/ prefix if included
      if (subreddit.startsWith('r/')) {
        subreddit = subreddit.slice(2);
      }
      
      try {
        const response = await axios.get(`https://www.reddit.com/r/${subreddit}/hot.json?limit=100`);
        const posts = response.data.data.children;
        
        // Filter for image posts that aren't stickied and are suitable for work
        const validPosts = posts.filter(post => 
          post.data.post_hint === 'image' && 
          !post.data.stickied && 
          !post.data.over_18
        );
        
        if (!validPosts.length) {
          return message.reply(`Couldn't find any appropriate memes from r/${subreddit}. Try another subreddit.`);
        }
        
        // Select a random meme from filtered posts
        const randomPost = validPosts[Math.floor(Math.random() * validPosts.length)].data;
        
        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(randomPost.title)
          .setURL(`https://reddit.com${randomPost.permalink}`)
          .setImage(randomPost.url)
          .setFooter({ text: `👍 ${randomPost.ups} | 💬 ${randomPost.num_comments} | From r/${subreddit}` });
        
        return message.reply({ embeds: [embed] });
      } catch (error) {
        return message.reply(`Error fetching memes from r/${subreddit}. It might not exist or be private.`);
      }
    }
  },

  // 6. Rock Paper Scissors
  {
    name: 'rps',
    description: 'Play rock, paper, scissors against the bot',
    usage: '+rps [rock/paper/scissors]',
    aliases: ['rockpaperscissors'],
    category: CommandCategory.FUN,
    cooldown: 3,
    requiredPermissions: [],
    execute: async (message, args) => {
      const choices = ['rock', 'paper', 'scissors'];
      const userChoice = args[0]?.toLowerCase();
      
      if (!userChoice || !choices.includes(userChoice)) {
        return message.reply('Please provide a valid choice: rock, paper, or scissors.');
      }
      
      const botChoice = choices[Math.floor(Math.random() * choices.length)];
      
      // Determine winner
      let result;
      if (userChoice === botChoice) {
        result = "It's a tie!";
      } else if (
        (userChoice === 'rock' && botChoice === 'scissors') ||
        (userChoice === 'paper' && botChoice === 'rock') ||
        (userChoice === 'scissors' && botChoice === 'paper')
      ) {
        result = 'You win!';
      } else {
        result = 'I win!';
      }
      
      // Emojis for choices
      const emojis = {
        rock: '🪨',
        paper: '📄',
        scissors: '✂️'
      };
      
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('Rock Paper Scissors')
        .addFields(
          { name: 'Your Choice', value: `${emojis[userChoice as keyof typeof emojis]} ${userChoice}`, inline: true },
          { name: 'My Choice', value: `${emojis[botChoice as keyof typeof emojis]} ${botChoice}`, inline: true },
          { name: 'Result', value: result }
        );
      
      return message.reply({ embeds: [embed] });
    }
  },

  // 7. Emote command
  {
    name: 'emote',
    description: 'Express an emotion with a GIF',
    usage: '+emote [emotion] [@user]',
    aliases: ['emotion', 'express'],
    category: CommandCategory.FUN,
    cooldown: 5,
    requiredPermissions: [],
    execute: async (message, args) => {
      if (!args.length) {
        return message.reply('Please specify an emotion (hug, slap, pat, kiss, etc.)');
      }
      
      const emotion = args[0].toLowerCase();
      const target = message.mentions.users.first();
      const validEmotions = ['hug', 'slap', 'pat', 'kiss', 'poke', 'cuddle', 'dance', 'cry', 'laugh'];
      
      if (!validEmotions.includes(emotion)) {
        return message.reply(`Invalid emotion. Valid options: ${validEmotions.join(', ')}`);
      }
      
      try {
        // Using nekos.best API for anime GIFs
        const response = await axios.get(`https://nekos.best/api/v2/${emotion}`);
        const gifUrl = response.data.results[0].url;
        
        let description;
        if (target) {
          description = `<@${message.author.id}> ${emotion}s <@${target.id}>`;
        } else {
          description = `<@${message.author.id}> ${emotion}s`;
        }
        
        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setDescription(description)
          .setImage(gifUrl);
        
        return message.reply({ embeds: [embed] });
      } catch (error) {
        console.error('Error fetching emotion GIF:', error);
        return message.reply('Failed to fetch a GIF. Please try again later.');
      }
    }
  },

  // 8. Fact command
  {
    name: 'fact',
    description: 'Shares a random fun fact',
    usage: '+fact [animal]',
    category: CommandCategory.FUN,
    cooldown: 5,
    requiredPermissions: [],
    execute: async (message, args) => {
      const animal = args[0]?.toLowerCase();
      const validAnimals = ['cat', 'dog', 'bird', 'panda', 'fox', 'koala'];
      
      try {
        let factUrl = 'https://uselessfacts.jsph.pl/api/v2/facts/random';
        let title = 'Random Fun Fact';
        
        // If a valid animal was specified, get an animal fact instead
        if (animal && validAnimals.includes(animal)) {
          factUrl = `https://some-random-api.ml/facts/${animal}`;
          title = `${animal.charAt(0).toUpperCase() + animal.slice(1)} Fact`;
        }
        
        const response = await axios.get(factUrl);
        const fact = response.data.text || response.data.fact;
        
        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(title)
          .setDescription(fact);
        
        return message.reply({ embeds: [embed] });
      } catch (error) {
        console.error('Error fetching fact:', error);
        return message.reply('Failed to fetch a fact. Please try again later.');
      }
    }
  },

  // 9. Poll command
  {
    name: 'poll',
    description: 'Creates a simple poll with reactions',
    usage: '+poll [question]',
    category: CommandCategory.FUN,
    cooldown: 30,
    requiredPermissions: [],
    execute: async (message, args) => {
      if (!args.length) {
        return message.reply('Please provide a question for the poll.');
      }
      
      const question = args.join(' ');
      
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📊 Poll')
        .setDescription(question)
        .setFooter({ text: `Started by ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
        .setTimestamp();
      
      const pollMessage = await message.channel.send({ embeds: [embed] });
      
      // Add reaction options
      await pollMessage.react('👍');
      await pollMessage.react('👎');
      await pollMessage.react('🤷');
      
      return message.reply('Poll created!');
    }
  },

  // 10. Quote command
  {
    name: 'quote',
    description: 'Shares an inspirational or funny quote',
    usage: '!quote',
    category: CommandCategory.FUN,
    cooldown: 5,
    requiredPermissions: [],
    execute: async (message) => {
      try {
        const response = await axios.get('https://api.quotable.io/random');
        const { content, author } = response.data;
        
        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('📜 Random Quote')
          .setDescription(`"${content}"`)
          .setFooter({ text: `— ${author}` });
        
        return message.reply({ embeds: [embed] });
      } catch (error) {
        console.error('Error fetching quote:', error);
        return message.reply('Failed to fetch a quote. Please try again later.');
      }
    }
  },

  // 11. Choose command
  {
    name: 'choose',
    description: 'Helps you choose between multiple options',
    usage: '!choose [option1] | [option2] | [etc...]',
    aliases: ['pick', 'select'],
    category: CommandCategory.FUN,
    cooldown: 3,
    requiredPermissions: [],
    execute: async (message, args) => {
      const options = args.join(' ').split('|').map(option => option.trim());
      
      if (options.length < 2 || options.some(opt => opt === '')) {
        return message.reply('Please provide at least two options separated by `|`.');
      }
      
      const chosen = options[Math.floor(Math.random() * options.length)];
      
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🤔 Choice Made')
        .setDescription(`I choose: **${chosen}**`)
        .addFields({ name: 'Options', value: options.join('\n') });
      
      return message.reply({ embeds: [embed] });
    }
  },

  // 12. Reverse command
  {
    name: 'reverse',
    description: 'Reverses the given text',
    usage: '!reverse [text]',
    category: CommandCategory.FUN,
    cooldown: 3,
    requiredPermissions: [],
    execute: async (message, args) => {
      if (!args.length) {
        return message.reply('Please provide text to reverse.');
      }
      
      const text = args.join(' ');
      const reversed = text.split('').reverse().join('');
      
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🔄 Text Reverser')
        .addFields(
          { name: 'Original', value: text },
          { name: 'Reversed', value: reversed }
        );
      
      return message.reply({ embeds: [embed] });
    }
  },

  // 13. Trivia command
  {
    name: 'trivia',
    description: 'Tests your knowledge with a random trivia question',
    usage: '!trivia',
    category: CommandCategory.FUN,
    cooldown: 10,
    requiredPermissions: [],
    execute: async (message) => {
      try {
        const response = await axios.get('https://opentdb.com/api.php?amount=1&type=multiple');
        const triviaData = response.data.results[0];
        
        // Decode HTML entities in the questions and answers
        const decoder = document.createElement('div');
        decoder.innerHTML = triviaData.question;
        const question = decoder.textContent;
        
        decoder.innerHTML = triviaData.correct_answer;
        const correctAnswer = decoder.textContent;
        
        const incorrectAnswers = triviaData.incorrect_answers.map(answer => {
          decoder.innerHTML = answer;
          return decoder.textContent;
        });
        
        // Mix all answers together
        const allAnswers = [correctAnswer, ...incorrectAnswers];
        for (let i = allAnswers.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [allAnswers[i], allAnswers[j]] = [allAnswers[j], allAnswers[i]];
        }
        
        // Create answer letter options
        const options = ['A', 'B', 'C', 'D'];
        const answerMap = new Map();
        allAnswers.forEach((answer, i) => {
          answerMap.set(options[i], answer);
        });
        
        const correctLetter = options[allAnswers.indexOf(correctAnswer)];
        
        // Create the display for the answers
        const answerList = Array.from(answerMap.entries())
          .map(([letter, answer]) => `${letter}: ${answer}`)
          .join('\n');
        
        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(`Trivia: ${triviaData.category}`)
          .setDescription(`**${question}**`)
          .addFields(
            { name: 'Options', value: answerList },
            { name: 'Difficulty', value: triviaData.difficulty.charAt(0).toUpperCase() + triviaData.difficulty.slice(1) }
          )
          .setFooter({ text: 'Reply with the letter of your answer in 15 seconds' });
        
        const triviaMessage = await message.reply({ embeds: [embed] });
        
        // Create a filter to only collect answers from the command user
        const filter = (response: any) => {
          return response.author.id === message.author.id && 
                 options.includes(response.content.toUpperCase());
        };
        
        try {
          const collected = await message.channel.awaitMessages({ 
            filter, 
            max: 1, 
            time: 15000, 
            errors: ['time'] 
          });
          
          const userAnswer = collected.first()?.content.toUpperCase();
          
          if (userAnswer === correctLetter) {
            const successEmbed = new EmbedBuilder()
              .setColor(0x57F287)
              .setTitle('Correct Answer!')
              .setDescription(`That's right! The answer was: **${correctAnswer}**`);
            
            await triviaMessage.reply({ embeds: [successEmbed] });
          } else {
            const wrongEmbed = new EmbedBuilder()
              .setColor(0xED4245)
              .setTitle('Wrong Answer!')
              .setDescription(`The correct answer was: **${correctLetter}: ${correctAnswer}**`);
            
            await triviaMessage.reply({ embeds: [wrongEmbed] });
          }
        } catch (e) {
          // Time ran out
          const timeoutEmbed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('Time\'s Up!')
            .setDescription(`The correct answer was: **${correctLetter}: ${correctAnswer}**`);
          
          await triviaMessage.reply({ embeds: [timeoutEmbed] });
        }
      } catch (error) {
        console.error('Error fetching trivia:', error);
        return message.reply('Failed to fetch a trivia question. Please try again later.');
      }
    }
  },

  // 14. Hangman command
  {
    name: 'hangman',
    description: 'Play a game of hangman',
    usage: '!hangman',
    category: CommandCategory.FUN,
    cooldown: 30,
    requiredPermissions: [],
    execute: async (message) => {
      try {
        // Get a random word from API
        const response = await axios.get('https://random-word-api.herokuapp.com/word');
        const word = response.data[0];
        
        if (!word || word.length < 3) {
          return message.reply('Failed to get a suitable word. Please try again.');
        }
        
        // Setup game state
        let guessedLetters: string[] = [];
        let wrongGuesses = 0;
        const maxWrongGuesses = 6;
        
        // Display hangman function
        const getHangman = (wrong: number) => {
          const stages = [
            '```\n      \n      \n      \n      \n      \n=========```',
            '```\n  +---+\n      |\n      |\n      |\n      |\n=========```',
            '```\n  +---+\n  |   |\n      |\n      |\n      |\n=========```',
            '```\n  +---+\n  |   |\n  O   |\n      |\n      |\n=========```',
            '```\n  +---+\n  |   |\n  O   |\n  |   |\n      |\n=========```',
            '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n      |\n=========```',
            '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n / \\  |\n=========```'
          ];
          return stages[wrong];
        };
        
        // Display word function
        const getWordDisplay = (word: string, guessed: string[]) => {
          return word
            .split('')
            .map(letter => (guessed.includes(letter) ? letter : '_'))
            .join(' ');
        };
        
        // Initial embed
        const createEmbed = (wordDisplay: string, wrong: number, guessed: string[]) => {
          return new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('Hangman Game')
            .setDescription(getHangman(wrong))
            .addFields(
              { name: 'Word', value: `\`${wordDisplay}\`` },
              { name: 'Guessed Letters', value: guessed.length ? guessed.join(', ') : 'None' },
              { name: 'Wrong Guesses', value: `${wrong}/${maxWrongGuesses}` }
            )
            .setFooter({ text: 'Type a letter to guess | Type "quit" to end the game' });
        };
        
        // Start the game
        const wordDisplay = getWordDisplay(word, guessedLetters);
        const gameEmbed = createEmbed(wordDisplay, wrongGuesses, guessedLetters);
        
        const gameMessage = await message.reply({ embeds: [gameEmbed] });
        
        // Create collector for guesses
        const filter = (response: any) => {
          return response.author.id === message.author.id && 
                 (response.content.length === 1 || response.content.toLowerCase() === 'quit');
        };
        
        const collector = message.channel.createMessageCollector({ filter, time: 60000 * 3 }); // 3 minutes
        
        collector.on('collect', async (msg) => {
          const guess = msg.content.toLowerCase();
          
          // Check if player wants to quit
          if (guess === 'quit') {
            collector.stop('quit');
            return;
          }
          
          // Validate guess
          if (!/^[a-z]$/.test(guess)) {
            return message.reply('Please guess a single letter (a-z).');
          }
          
          // Check if letter was already guessed
          if (guessedLetters.includes(guess)) {
            return message.reply('You already guessed that letter!');
          }
          
          // Add to guessed letters
          guessedLetters.push(guess);
          
          // Check if guess is correct
          if (word.includes(guess)) {
            // Update display
            const newWordDisplay = getWordDisplay(word, guessedLetters);
            
            // Check if word is complete
            if (!newWordDisplay.includes('_')) {
              collector.stop('win');
              return;
            }
            
            const updatedEmbed = createEmbed(newWordDisplay, wrongGuesses, guessedLetters);
            await gameMessage.edit({ embeds: [updatedEmbed] });
          } else {
            // Wrong guess
            wrongGuesses++;
            
            if (wrongGuesses >= maxWrongGuesses) {
              collector.stop('lose');
              return;
            }
            
            const newWordDisplay = getWordDisplay(word, guessedLetters);
            const updatedEmbed = createEmbed(newWordDisplay, wrongGuesses, guessedLetters);
            await gameMessage.edit({ embeds: [updatedEmbed] });
          }
        });
        
        collector.on('end', (collected, reason) => {
          // Game end logic
          if (reason === 'win') {
            const winEmbed = new EmbedBuilder()
              .setColor(0x57F287)
              .setTitle('You Won! 🎉')
              .setDescription(`You correctly guessed the word: **${word}**`);
            
            gameMessage.reply({ embeds: [winEmbed] });
          } else if (reason === 'lose') {
            const loseEmbed = new EmbedBuilder()
              .setColor(0xED4245)
              .setTitle('Game Over!')
              .setDescription(getHangman(maxWrongGuesses))
              .addFields({ name: 'The word was', value: word });
            
            gameMessage.reply({ embeds: [loseEmbed] });
          } else if (reason === 'quit') {
            const quitEmbed = new EmbedBuilder()
              .setColor(0xFFCC4D)
              .setTitle('Game Ended')
              .setDescription(`You quit the game. The word was: **${word}**`);
            
            gameMessage.reply({ embeds: [quitEmbed] });
          } else {
            // Time expired
            const timeEmbed = new EmbedBuilder()
              .setColor(0xFFCC4D)
              .setTitle('Time\'s Up!')
              .setDescription(`The game has ended. The word was: **${word}**`);
            
            gameMessage.reply({ embeds: [timeEmbed] });
          }
        });
      } catch (error) {
        console.error('Error in hangman command:', error);
        return message.reply('Failed to start hangman game. Please try again later.');
      }
    }
  },

  // 15. Dice picture command
  {
    name: 'dicepic',
    description: 'Shows a picture of dice with the specified number',
    usage: '!dicepic [1-6]',
    aliases: ['showdice'],
    category: CommandCategory.FUN,
    cooldown: 3,
    requiredPermissions: [],
    execute: async (message, args) => {
      const diceValue = parseInt(args[0]) || Math.floor(Math.random() * 6) + 1;
      
      if (diceValue < 1 || diceValue > 6) {
        return message.reply('Please provide a number between 1 and 6.');
      }
      
      // ASCII dice representations
      const diceArt = [
        "```\n+-------+\n|       |\n|   O   |\n|       |\n+-------+\n```",
        "```\n+-------+\n| O     |\n|       |\n|     O |\n+-------+\n```",
        "```\n+-------+\n| O     |\n|   O   |\n|     O |\n+-------+\n```",
        "```\n+-------+\n| O   O |\n|       |\n| O   O |\n+-------+\n```",
        "```\n+-------+\n| O   O |\n|   O   |\n| O   O |\n+-------+\n```",
        "```\n+-------+\n| O   O |\n| O   O |\n| O   O |\n+-------+\n```"
      ];
      
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`Dice: ${diceValue}`)
        .setDescription(diceArt[diceValue - 1]);
      
      return message.reply({ embeds: [embed] });
    }
  },
];
