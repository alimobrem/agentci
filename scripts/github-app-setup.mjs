// Compatibility entry point; build first. Installed users run `agentci setup`.
import { startAppSetup } from '../dist/packages/onboarding/setup.js';
await startAppSetup();
