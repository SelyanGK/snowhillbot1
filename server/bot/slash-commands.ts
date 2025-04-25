{
  name: 'slowmode',
  description: 'Set slowmode for a channel',
  options: [
    {
      name: 'seconds',
      type: ApplicationCommandOptionType.Integer,
      description: 'Slowmode duration in seconds (0-21600)',
      required: true
    },
    {
      name: 'channel',
      type: ApplicationCommandOptionType.Channel,
      description: 'Channel to set slowmode in (defaults to current)',
      channel_types: [ChannelType.GuildText]
    }
  ],
  // ... other command properties
}