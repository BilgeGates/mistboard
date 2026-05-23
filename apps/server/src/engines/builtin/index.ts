import type { EngineDefinition } from '../types.js';
import { captureSeekerEngine } from './capture-seeker.js';
import { randomLegalEngine } from './random-legal.js';

export const BUILTIN_ENGINES: Record<string, EngineDefinition> = {
  [captureSeekerEngine.id]: captureSeekerEngine,
  [randomLegalEngine.id]: randomLegalEngine,
};
