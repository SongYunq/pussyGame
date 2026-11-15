/** 牌桌快捷表情与短语白名单，前后端共用；服务端只广播白名单内容，杜绝伪造任意文本。 */
export const QUICK_EMOJIS = ['🔥', '😎', '😭', '💀', '💰', '👍', '🚀', '🍺'] as const;

export const QUICK_PHRASES = [
  '快点吧，我等到花儿都谢了！',
  '梭哈是一种智慧！',
  '风水轮流转，底裤全靠这把！',
  '老铁，稳住别慌！',
  '搏一搏，单车变摩托！',
] as const;

/** 解析客户端上报的短语：优先按编号取标准文案，兼容旧客户端“编号 0 + 原文”的上报方式。 */
export function resolvePhrase(phraseId: unknown, text: unknown): { phraseId: number; text: string } | null {
  if (typeof text === 'string') {
    const index = QUICK_PHRASES.indexOf(text as typeof QUICK_PHRASES[number]);
    if (index !== -1) return { phraseId: index, text: QUICK_PHRASES[index] };
  }
  if (Number.isSafeInteger(phraseId) && (phraseId as number) >= 0 && (phraseId as number) < QUICK_PHRASES.length) {
    return { phraseId: phraseId as number, text: QUICK_PHRASES[phraseId as number] };
  }
  return null;
}

export function isQuickEmoji(value: unknown): value is typeof QUICK_EMOJIS[number] {
  return typeof value === 'string' && (QUICK_EMOJIS as readonly string[]).includes(value);
}
