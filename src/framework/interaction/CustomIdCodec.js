/**
 * CustomIdCodec - Encodes/decodes Discord button custom IDs
 *
 * v1 format (legacy): v1:{sessionId}:{action}:{details}:{phase}:{token}
 * v2 format (compact): v2:{sessionIdNoDashes}:{action}:{detailsB64Url}:{phaseCode}:{tokenBase36}
 */

class CustomIdCodec {
  constructor() {
    this.phaseToCode = new Map([
      ['WAITING', 'w'],
      ['ACTIVE', 'a'],
      ['TEAM_A', 'ta'],
      ['TEAM_B', 'tb'],
      ['ROUND_END', 're'],
      ['GAME_END', 'ge'],
      ['SPINNING', 'sp'],
      ['KICK_SELECTION', 'ks'],
      ['DOUBLE_KICK', 'dk'],
      ['FINAL_ROUND', 'fr'],
      ['ROLE_REVEAL', 'rr'],
      ['NIGHT_MAFIA', 'nm'],
      ['NIGHT_DOCTOR', 'nd'],
      ['NIGHT_DETECTIVE', 'nt'],
      ['RESOLVE_NIGHT', 'rn'],
      ['DAY_DISCUSS', 'dd'],
      ['DAY_VOTE', 'dv'],
      ['RESOLVE_VOTE', 'rv'],
      ['ENDED', 'e'],
    ]);
    this.codeToPhase = new Map([...this.phaseToCode.entries()].map(([phase, code]) => [code, phase]));
  }

  encodeBase64Url(value) {
    return Buffer.from(String(value))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  decodeBase64Url(value) {
    const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
    const padLength = normalized.length % 4 === 0 ? 0 : 4 - (normalized.length % 4);
    const padded = normalized + '='.repeat(padLength);
    return Buffer.from(padded, 'base64').toString();
  }

  encodeSessionId(sessionId) {
    const str = String(sessionId);
    if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(str)) {
      return `u${str.replace(/-/g, '')}`;
    }
    return `s${str}`;
  }

  decodeSessionId(encodedSessionId) {
    const str = String(encodedSessionId);
    if (str.startsWith('u')) {
      const raw = str.slice(1);
      if (/^[0-9a-fA-F]{32}$/.test(raw)) {
        return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
      }
    }
    if (str.startsWith('s')) {
      return str.slice(1);
    }

    // Backward-compat with earlier v2 values (without type prefix).
    if (/^[0-9a-fA-F]{32}$/.test(str)) {
      return `${str.slice(0, 8)}-${str.slice(8, 12)}-${str.slice(12, 16)}-${str.slice(16, 20)}-${str.slice(20)}`;
    }
    return str;
  }

  encodePhase(phase) {
    return this.phaseToCode.get(phase) || phase;
  }

  decodePhase(code) {
    return this.codeToPhase.get(code) || code;
  }

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
    const compactSessionId = this.encodeSessionId(sessionId);
    const safeDetails = details ? this.encodeBase64Url(details) : '';
    const phaseCode = this.encodePhase(phase);
    const tokenBase36 = Number(token || 0).toString(36);
    return `v2:${compactSessionId}:${action}:${safeDetails}:${phaseCode}:${tokenBase36}`;
  }

  /**
   * Decode a custom ID from a button
   * @param {string} customId - The button's custom ID
   * @returns {Object} Decoded components
   * @throws {Error} If version is unsupported
   */
  decode(customId) {
    const parts = customId.split(':');

    if (parts[0] === 'v2') {
      if (parts.length < 6) {
        throw new Error(`Invalid v2 customId: ${customId}`);
      }

      const [version, compactSessionId, action, safeDetails, phaseCode, tokenBase36] = parts;
      return {
        version,
        sessionId: this.decodeSessionId(compactSessionId),
        action,
        details: safeDetails ? this.decodeBase64Url(safeDetails) : null,
        phase: this.decodePhase(phaseCode),
        token: parseInt(tokenBase36, 36) || 0,
      };
    }

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
   * Check if a custom ID uses our supported format
   * @param {string} customId - The button's custom ID
   * @returns {boolean}
   */
  isSupportedFormat(customId) {
    return typeof customId === 'string' && (customId.startsWith('v1:') || customId.startsWith('v2:'));
  }

  /**
   * Backward-compatible alias used in existing callsites.
   * @param {string} customId
   * @returns {boolean}
   */
  isV1Format(customId) {
    return this.isSupportedFormat(customId);
  }
}

// Export singleton instance
export const codec = new CustomIdCodec();
export default CustomIdCodec;
