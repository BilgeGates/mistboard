import { captureSeekerEngine } from './capture-seeker.js';
import { randomLegalEngine } from './random-legal.js';
import type { EngineDefinition } from '../types.js';

export const BUILTIN_ENGINES: Record<string, EngineDefinition> = {
  [captureSeekerEngine.id]: captureSeekerEngine,
  [randomLegalEngine.id]: randomLegalEngine,
};
