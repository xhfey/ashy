/**
 * CustomIdCodec - Encodes/decodes Discord button custom IDs
 *
 * Format: v1:{sessionId}:{action}:{details}:{phase}:{token}
 *
 * - v1 prefix allows future format migrations
 * - details is base64 encoded to avoid : conflicts
 * - token (uiVersion) prevents stale button clicks
 */

class CustomIdCodec {
  /**
   * Encode a custom ID for a button
   * @param {string} sessionId - Game session ID
   * @param {string} action - Action name (join, leave, roll, etc.)
   * @param {string} details - Additional data (userId, slot number, etc.)
   * @param {string} phase - Current game phase (WAITING, ACTIVE, etc.)
   * @param {number} token - UI version for stale click detection
   * @returns {string} Encoded custom ID
   */
  encode(sessionId, action, details = '', phase = 'WAITING', token = 0) {
    const safeDetails = details ? Buffer.from(String(details)).toString('base64') : '';
    return `v1:${sessionId}:${action}:${safeDetails}:${phase}:${token}`;
  }

  /**
   * Decode a custom ID from a button
   * @param {string} customId - The button's custom ID
   * @returns {Object} Decoded components
   * @throws {Error} If version is unsupported
   */
  decode(customId) {
    const parts = customId.split(':');

    // Version check (future-proofing)
    if (parts[0] !== 'v1') {
      throw new Error(`Unsupported customId version: ${parts[0]}`);
    }

    const [version, sessionId, action, safeDetails, phase, tokenStr] = parts;

    return {
      version,
      sessionId,
      action,
      details: safeDetails ? Buffer.from(safeDetails, 'base64').toString() : null,
      phase,
      token: parseInt(tokenStr) || 0
    };
  }

  /**
   * Helper to generate button ID for a session
   * @param {Object} session - Game session object
   * @param {string} action - Action name
   * @param {string} details - Additional data
   * @returns {string} Encoded custom ID
   */
  forSession(session, action, details = '') {
    return this.encode(
      session.id,
      action,
      details,
      session.phase || 'WAITING',
      session.uiVersion || 0
    );
  }

  /**
   * Check if a custom ID uses our v1 format
   * @param {string} customId - The button's custom ID
   * @returns {boolean}
   */
  isV1Format(customId) {
    return customId.startsWith('v1:');
  }
}

// Export singleton instance
export const codec = new CustomIdCodec();
export default CustomIdCodec;
