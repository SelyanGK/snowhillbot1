import { Command } from "./types";

// Function to get commands from the backend API
export async function getAllCommands(): Promise<Command[]> {
  try {
    const response = await fetch('/api/commands');
    if (!response.ok) {
      throw new Error('Failed to fetch commands');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching commands:', error);
    return [];
  }
}

// Function to get commands by category
export async function getCommandsByCategory(category: string): Promise<Command[]> {
  try {
    const response = await fetch(`/api/commands?category=${category}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${category} commands`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error fetching ${category} commands:`, error);
    return [];
  }
}
