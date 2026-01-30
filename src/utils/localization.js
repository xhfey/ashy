/**
 * ╔═══════════════════════════════════════════════════════════╗
 * ║  DISCORD LOCALIZATION HELPERS                              ║
 * ║  Support for bilingual command names & descriptions       ║
 * ╚═══════════════════════════════════════════════════════════╝
 */

import { Locale } from 'discord.js';

/**
 * Apply localization to a slash command builder
 * Sets Arabic as primary with English as fallback
 * 
 * @param {SlashCommandBuilder} builder - The command builder
 * @param {Object} name - { ar: 'اسم-الأمر', en: 'command-name' }
 * @param {Object} description - { ar: 'وصف بالعربي', en: 'English description' }
 * @returns {SlashCommandBuilder} - Modified builder
 * 
 * @example
 * localizeCommand(
 *   new SlashCommandBuilder(),
 *   { ar: 'رصيد', en: 'balance' },
 *   { ar: 'تحقق من رصيدك', en: 'Check your balance' }
 * )
 */
export function localizeCommand(builder, name, description) {
    return builder
        .setName(name.ar)
        .setDescription(description.ar)
        .setNameLocalizations({
            [Locale.EnglishUS]: name.en,
            [Locale.EnglishGB]: name.en
        })
        .setDescriptionLocalizations({
            [Locale.EnglishUS]: description.en,
            [Locale.EnglishGB]: description.en
        });
}

/**
 * Apply localization to a command option
 * 
 * @param {Object} option - The option builder (StringOption, UserOption, etc.)
 * @param {Object} name - { ar: 'اسم', en: 'name' }
 * @param {Object} description - { ar: 'وصف', en: 'description' }
 * @returns {Object} - Modified option
 */
export function localizeOption(option, name, description) {
    return option
        .setName(name.ar)
        .setDescription(description.ar)
        .setNameLocalizations({
            [Locale.EnglishUS]: name.en,
            [Locale.EnglishGB]: name.en
        })
        .setDescriptionLocalizations({
            [Locale.EnglishUS]: description.en,
            [Locale.EnglishGB]: description.en
        });
}

/**
 * Common localized strings for reuse across commands
 */
export const CommonLocalizations = {
    options: {
        user: {
            name: { ar: 'مستخدم', en: 'user' },
            description: { ar: 'المستخدم المستهدف', en: 'The target user' }
        },
        amount: {
            name: { ar: 'مبلغ', en: 'amount' },
            description: { ar: 'المبلغ المطلوب', en: 'The amount' }
        },
        reason: {
            name: { ar: 'سبب', en: 'reason' },
            description: { ar: 'سبب هذا الإجراء', en: 'Reason for this action' }
        }
    }
};

/**
 * Validate Arabic command name meets Discord requirements
 * - 1-32 characters
 * - No spaces (use hyphens)
 * - Unicode letters allowed
 * 
 * @param {string} name - Command name to validate
 * @returns {Object} - { valid: boolean, error?: string }
 */
export function validateCommandName(name) {
    if (!name || name.length === 0) {
        return { valid: false, error: 'Command name cannot be empty' };
    }

    if (name.length > 32) {
        return { valid: false, error: `Command name too long: ${name.length}/32 chars` };
    }

    if (name.includes(' ')) {
        return { valid: false, error: 'Command name cannot contain spaces (use hyphens)' };
    }

    // Discord allows: lowercase letters, numbers, hyphens, underscores
    // Plus Unicode letter category \p{L} for Arabic etc.
    const validPattern = /^[\p{L}\p{N}_-]+$/u;
    if (!validPattern.test(name)) {
        return { valid: false, error: 'Command name contains invalid characters' };
    }

    return { valid: true };
}
