/**
 * This file exists to test command functionality before deployment
 */
import { Client, Message, Role, GuildMember, User } from 'discord.js';
import { storage } from '../storage';

// Testing function for antiping command functionality
export async function testAntipingCommands(roleId: string) {
  // Create mock objects for testing
  const mockGuild = { id: '12345', name: 'Test Server' };
  const mockAuthor = { id: '67890', tag: 'Test User#1234' };
  const mockRole = { id: roleId, name: 'Test Role' };

  // Initialize server in the database
  let server = await storage.getServer(mockGuild.id);
  if (!server) {
    server = await storage.createServer({
      id: mockGuild.id,
      name: mockGuild.name,
      prefix: '+',
      antiPingEnabled: false,
      antiPingExcludedRoles: [],
      antiPingPunishment: 'warn'
    });
  }

  // Mock mentions object for testing
  const mockMentions = {
    roles: {
      first: () => mockRole as unknown as Role
    },
    users: {
      first: () => ({ id: '67890' } as unknown as User)
    }
  };

  // Mock message for testing
  const mockMessage = {
    author: mockAuthor,
    guild: mockGuild,
    member: { 
      permissions: { 
        has: () => true
      } 
    } as unknown as GuildMember,
    mentions: mockMentions,
    reply: (content: any) => {
      console.log('REPLY:', typeof content === 'string' ? content : JSON.stringify(content));
      return Promise.resolve();
    },
    channel: { id: '11111' },
    client: {} as Client,
    commandName: 'antiping',
    content: '/antiping'
  } as unknown as Message;

  console.log('---- Testing antiping functionality ----');

  // Test server setup
  console.log('Initial server state:', server);

  // Import the commands dynamically to avoid circular dependencies
  const { default: commands } = await import('./index');
  const antipingCommand = commands.find(cmd => cmd.name === 'antiping');

  if (!antipingCommand) {
    console.error('Could not find antiping command');
    return;
  }

  // Test the 'on' action
  console.log('\n1. Testing "on" action:');
  await antipingCommand.execute(mockMessage, ['on'], {} as Client);
  
  // Verify server state
  server = await storage.getServer(mockGuild.id);
  console.log('Server state after "on":', server?.antiPingEnabled);

  // Test the 'protect' action
  console.log('\n2. Testing "protect" action:');
  await antipingCommand.execute(mockMessage, ['protect'], {} as Client);
  
  // Verify protected roles
  server = await storage.getServer(mockGuild.id);
  console.log('Protected roles after "protect":', server?.antiPingProtectedRoles);

  // Test the 'bypass' action
  console.log('\n3. Testing "bypass" action:');
  await antipingCommand.execute(mockMessage, ['bypass'], {} as Client);
  
  // Verify bypass roles
  server = await storage.getServer(mockGuild.id);
  console.log('Bypass roles after "bypass":', server?.antiPingBypassRoles);

  // Test the 'exclude' action
  console.log('\n4. Testing "exclude" action:');
  await antipingCommand.execute(mockMessage, ['exclude'], {} as Client);
  
  // Verify excluded roles
  server = await storage.getServer(mockGuild.id);
  console.log('Excluded roles after "exclude":', server?.antiPingExcludedRoles);

  // Test the 'settings' action
  console.log('\n5. Testing "settings" action:');
  await antipingCommand.execute(mockMessage, ['settings'], {} as Client);

  console.log('\nTest completed.');
}

// Add a main function to run the tests
export async function runTests() {
  await testAntipingCommands('12345678901234');
}