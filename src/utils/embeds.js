import { EmbedBuilder } from 'discord.js';
import config from '../config/bot.config.js';

export function successEmbed(title, description) {
  return new EmbedBuilder()
    .setTitle(`${config.emojis.check} ${title}`)
    .setDescription(description)
    .setColor(config.colors.success)
    .setTimestamp();
}

export function errorEmbed(title, description) {
  return new EmbedBuilder()
    .setTitle(`${config.emojis.cross} ${title}`)
    .setDescription(description)
    .setColor(config.colors.error)
    .setTimestamp();
}

export function infoEmbed(title, description) {
  return new EmbedBuilder()
    .setTitle(`ℹ️ ${title}`)
    .setDescription(description)
    .setColor(config.colors.info)
    .setTimestamp();
}

export function gameEmbed(title, description, fields = []) {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(config.colors.primary)
    .setFooter({ text: '🎮 آشي بوت' })
    .setTimestamp();

  if (fields.length > 0) {
    embed.addFields(fields);
  }

  return embed;
}

export function winnerEmbed(winnerName, reward) {
  return new EmbedBuilder()
    .setTitle(`${config.emojis.trophy} الفائز!`)
    .setDescription(`🎉 مبروك **${winnerName}**!\n\n${config.emojis.coin} ربحت **${reward}** عملة آشي`)
    .setColor(config.colors.gold)
    .setTimestamp();
}
