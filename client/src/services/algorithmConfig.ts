import { AlgorithmConfig, defaultAlgorithmConfig, validateAlgorithmConfig } from '../../../server/src/shared/dealing';

export const ALGORITHM_STORAGE_KEY = 'zjh_dealing_config_v1';

export function readLocalAlgorithmConfig(): AlgorithmConfig {
  if (typeof localStorage === 'undefined') return defaultAlgorithmConfig();
  const saved = localStorage.getItem(ALGORITHM_STORAGE_KEY);
  if (!saved) return defaultAlgorithmConfig();
  return validateAlgorithmConfig(JSON.parse(saved));
}

export function saveLocalAlgorithmConfig(input: unknown): AlgorithmConfig {
  const config = validateAlgorithmConfig(input);
  localStorage.setItem(ALGORITHM_STORAGE_KEY, JSON.stringify(config));
  return config;
}
