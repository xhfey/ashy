import { buttonRouter, codec } from './src/framework/index.js';
import { getPublicPlayChoices } from './src/games/registry.js';
import { getFeatureFlagsSnapshot } from './src/config/feature-flags.config.js';

console.log('Framework OK:', Boolean(buttonRouter), Boolean(codec));
console.log('Playable choices:', getPublicPlayChoices().map(c => c.value).join(', ') || 'none');
console.log('Feature flags loaded:', Object.keys(getFeatureFlagsSnapshot()).length > 0);

// Some imported modules start background timers; force fast exit for CI checks.
setTimeout(() => process.exit(0), 0);
