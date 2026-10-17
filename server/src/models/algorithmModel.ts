import { getDb } from '../db/database.js';
import { AlgorithmConfig, defaultAlgorithmConfig, validateAlgorithmConfig } from '../shared/dealing.js';

export class AlgorithmModel {
  static getConfig(): AlgorithmConfig {
    const row = getDb().prepare('SELECT value FROM game_settings WHERE key = ?').get('dealing_config_v1') as { value: string } | undefined;
    return row ? validateAlgorithmConfig(JSON.parse(row.value)) : defaultAlgorithmConfig();
  }

  static saveConfig(input: unknown): AlgorithmConfig {
    const config = validateAlgorithmConfig(input);
    getDb().prepare(`INSERT INTO game_settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`)
      .run('dealing_config_v1', JSON.stringify(config));
    return config;
  }
}
