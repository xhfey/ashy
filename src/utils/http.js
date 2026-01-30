import { Agent, setGlobalDispatcher } from 'undici';

const DEFAULTS = {
  connectTimeoutMs: 30_000,
  headersTimeoutMs: 30_000,
  bodyTimeoutMs: 30_000,
  keepAliveTimeoutMs: 60_000,
  keepAliveMaxTimeoutMs: 600_000,
  autoSelectFamilyAttemptTimeoutMs: 250,
};

function toPositiveInt(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.trunc(num) : fallback;
}

const agent = new Agent({
  connectTimeout: toPositiveInt(process.env.HTTP_CONNECT_TIMEOUT_MS, DEFAULTS.connectTimeoutMs),
  headersTimeout: toPositiveInt(process.env.HTTP_HEADERS_TIMEOUT_MS, DEFAULTS.headersTimeoutMs),
  bodyTimeout: toPositiveInt(process.env.HTTP_BODY_TIMEOUT_MS, DEFAULTS.bodyTimeoutMs),
  keepAliveTimeout: toPositiveInt(process.env.HTTP_KEEP_ALIVE_TIMEOUT_MS, DEFAULTS.keepAliveTimeoutMs),
  keepAliveMaxTimeout: toPositiveInt(process.env.HTTP_KEEP_ALIVE_MAX_TIMEOUT_MS, DEFAULTS.keepAliveMaxTimeoutMs),
  autoSelectFamily: true,
  autoSelectFamilyAttemptTimeout: DEFAULTS.autoSelectFamilyAttemptTimeoutMs,
});

setGlobalDispatcher(agent);

export function getHttpAgent() {
  return agent;
}
