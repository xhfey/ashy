/**
 * Game Framework - Main Entry Point
 *
 * Provides a unified API for building multiplayer Discord games
 *
 * Usage:
 *   import { sessionManager, buttonRouter, lobbyManager, codec } from './framework/index.js';
 */

// Interaction handling
import CustomIdCodec, { codec } from './interaction/CustomIdCodec.js';
import ButtonRouter from './interaction/ButtonRouter.js';

// Runtime
import SessionManager, { sessionManager } from './runtime/SessionManager.js';

// Modules
import LobbyManager from './modules/LobbyManager.js';

// Create instances
const lobbyManager = new LobbyManager(sessionManager);
const buttonRouter = new ButtonRouter(sessionManager);

// Export everything
export {
  // Classes (for custom instances)
  CustomIdCodec,
  ButtonRouter,
  SessionManager,
  LobbyManager,

  // Singleton instances (recommended)
  codec,
  sessionManager,
  lobbyManager,
  buttonRouter
};

// Default export for convenience
export default {
  codec,
  sessionManager,
  lobbyManager,
  buttonRouter
};
