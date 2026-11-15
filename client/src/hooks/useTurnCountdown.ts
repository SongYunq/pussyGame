import { useEffect, useState } from 'react';

/**
 * 根据服务端截止时间计算剩余秒数。
 * turnDeadline 是服务端时钟的绝对时间，clockOffsetMs = 服务端时间 − 本地时间，
 * 用于抵消玩家设备时钟不准导致的倒计时偏差。无截止时间（无限制房间）返回 null。
 */
export function remainingSeconds(turnDeadline: number | null, clockOffsetMs: number, now: number = Date.now()): number | null {
  if (turnDeadline === null) return null;
  return Math.max(0, Math.ceil((turnDeadline - (now + clockOffsetMs)) / 1000));
}

export function useTurnCountdown(turnDeadline: number | null, clockOffsetMs: number, active: boolean): number | null {
  const [seconds, setSeconds] = useState(() => (active ? remainingSeconds(turnDeadline, clockOffsetMs) : null));
  useEffect(() => {
    if (!active || turnDeadline === null) { setSeconds(null); return; }
    const tick = () => setSeconds(remainingSeconds(turnDeadline, clockOffsetMs));
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [turnDeadline, clockOffsetMs, active]);
  return seconds;
}
