import { Request, Response } from 'express';
import { AlgorithmModel } from '../models/algorithmModel.js';
import { simulateDeals } from '../shared/dealing.js';

export class AlgorithmController {
  static getConfig(_req: Request, res: Response): void {
    try { res.json({ code: 200, message: 'ok', data: AlgorithmModel.getConfig() }); }
    catch { res.status(500).json({ code: 500, message: '读取发牌配置失败', data: null }); }
  }
  static saveConfig(req: Request, res: Response): void {
    try {
      const config = AlgorithmModel.saveConfig(req.body);
      res.json({ code: 200, message: '发牌配置已保存，从下一局开始生效', data: config });
    } catch (error) {
      res.status(400).json({ code: 400, message: error instanceof Error ? error.message : '保存失败', data: null });
    }
  }
  static async simulate(req: Request, res: Response): Promise<void> {
    try {
      const { rounds, playerCount, config } = req.body ?? {};
      const result = await simulateDeals(rounds, playerCount, config === undefined ? AlgorithmModel.getConfig() : config);
      res.json({ code: 200, message: '真实发牌模拟完成', data: result });
    } catch (error) {
      res.status(400).json({ code: 400, message: error instanceof Error ? error.message : '模拟失败', data: null });
    }
  }
}
