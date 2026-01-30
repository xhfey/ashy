---
paths:
  - "src/commands/**/*.js"
  - "src/events/**/*.js"
---

# Discord.js Patterns for Ashy Bot

## Command Response Timing

Discord requires interaction response within 3 seconds. For longer operations:

```javascript
// ✅ CORRECT - Defer for long operations
await interaction.deferReply();
// ... long operation ...
await interaction.editReply({ content: 'تم!' });

// ❌ WRONG - Will fail after 3 seconds
// ... long operation ...
await interaction.reply({ content: 'تم!' });
```

## Error Responses

Always use ephemeral for errors:

```javascript
await interaction.reply({
  content: '❌ حدث خطأ!',
  ephemeral: true  // Only visible to user
});
```

## Button Custom IDs

Format: `[game]:[session]:[action]`

```javascript
new ButtonBuilder()
  .setCustomId(`نرد:${sessionId}:roll`)
  .setLabel('🎲 ارمِ النرد')
  .setStyle(ButtonStyle.Primary)
```

## Handling Already Replied

```javascript
try {
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ content: '...', ephemeral: true });
  } else {
    await interaction.reply({ content: '...' });
  }
} catch (error) {
  if (error.code === 'InteractionAlreadyReplied') {
    // Already handled, ignore
  } else {
    throw error;
  }
}
```

## Embed Best Practices

- Keep under 6000 total characters
- Max 25 fields
- Field names max 256 chars
- Field values max 1024 chars
- Use Arabic for all text

## Cooldowns

Implement per-user cooldowns for game commands:

```javascript
const cooldowns = new Map();
const COOLDOWN_MS = 30000; // 30 seconds

// In execute:
const now = Date.now();
const userCooldown = cooldowns.get(interaction.user.id);
if (userCooldown && now < userCooldown) {
  const remaining = Math.ceil((userCooldown - now) / 1000);
  return interaction.reply({
    content: `⏳ انتظر ${remaining} ثانية`,
    ephemeral: true
  });
}
cooldowns.set(interaction.user.id, now + COOLDOWN_MS);
```
