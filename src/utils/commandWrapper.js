/**
 * ╔═══════════════════════════════════════════════════════════╗
 * ║  COMMAND WRAPPER - Centralized Error Handling             ║
 * ║  Wraps all command executions with unified error handling ║
 * ╚═══════════════════════════════════════════════════════════╝
 */

import logger from './logger.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const strings = require('../localization/ar.json');
import {
    BotError,
    InsufficientBalanceError,
    CooldownError,
    PermissionError,
    GameError,
    ValidationError
} from './errors.js';

export {
    BotError,
    InsufficientBalanceError,
    CooldownError,
    PermissionError,
    GameError,
    ValidationError
};

/**
 * Safe reply helper - handles both replied/deferred and fresh interactions
 */
async function safeReply(interaction, content, ephemeral = true) {
    const reply = { content, ephemeral };

    try {
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(reply);
        } else {
            await interaction.reply(reply);
        }
    } catch (err) {
        // Interaction may have expired - log but don't throw
        logger.warn('Failed to send error reply:', err.message);
    }
}

/**
 * Wrap a command's execute function with centralized error handling
 * 
 * @param {Object} command - Command object with execute function
 * @returns {Object} - Command with wrapped execute function
 * 
 * @example
 * // In command file:
 * export default wrapCommand({
 *   data: new SlashCommandBuilder()...
 *   async execute(interaction) {
 *     // Just implement - no try-catch needed!
 *     throw new InsufficientBalanceError(100, 50);
 *   }
 * });
 */
export function wrapCommand(command) {
    const originalExecute = command.execute;

    command.execute = async function (interaction) {
        try {
            await originalExecute.call(this, interaction);
        } catch (error) {
            // Log all errors
            logger.error(`Command ${interaction.commandName} error:`, {
                error: error.message,
                stack: error.stack,
                user: interaction.user?.id,
                guild: interaction.guild?.id,
                channel: interaction.channel?.id
            });

            // Get user-facing message based on error type
            let userMessage = strings.common.error;

            if (error instanceof BotError) {
                userMessage = error.userMessage;
            } else if (error.code === 'P2002') {
                // Prisma unique constraint violation
                userMessage = '❌ هذا العنصر موجود بالفعل!';
            } else if (error.code === 'P2025') {
                // Prisma record not found
                userMessage = '❌ العنصر غير موجود!';
            }

            await safeReply(interaction, userMessage);
        }
    };

    // Also wrap handleButton if present
    if (command.handleButton) {
        const originalHandleButton = command.handleButton;

        command.handleButton = async function (interaction, sessionId, action) {
            try {
                await originalHandleButton.call(this, interaction, sessionId, action);
            } catch (error) {
                logger.error(`Button handler error:`, {
                    error: error.message,
                    customId: interaction.customId,
                    user: interaction.user?.id
                });

                const userMessage = error instanceof BotError ? error.userMessage : strings.common.error;
                await safeReply(interaction, userMessage);
            }
        };
    }

    return command;
}

/**
 * Export typed errors for use in commands/services
 */
export const Errors = {
    BotError,
    InsufficientBalanceError,
    CooldownError,
    PermissionError,
    GameError,
    ValidationError
};
