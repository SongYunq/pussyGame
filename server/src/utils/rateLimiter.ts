/**
 * 进程内滑动窗口限流器：每个键在 windowMs 内最多允许 limit 次。
 * 仅适用于单进程部署（当前架构即单进程单端口）；多实例需改为共享存储。
 */
export class SlidingWindowLimiter {
  private hits = new Map<string, number[]>();
  private calls = 0;

  constructor(private readonly limit: number, private readonly windowMs: number) {
    if (!Number.isInteger(limit) || limit < 1 || !Number.isFinite(windowMs) || windowMs <= 0) {
      throw new Error('限流参数无效');
    }
  }

  /** 记录一次尝试；未超限返回 true，已超限返回 false（超限的尝试不计入窗口）。 */
  tryConsume(key: string, now: number = Date.now()): boolean {
    // 定期清扫过期键，避免一次性键（已断开连接、随机用户名）长期占用内存。
    if (++this.calls % 1000 === 0) this.sweep(now);
    const recent = this.prune(key, now);
    if (recent.length >= this.limit) return false;
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  /** 距离下一次允许尝试的毫秒数，未超限时为 0。 */
  retryAfterMs(key: string, now: number = Date.now()): number {
    const recent = this.prune(key, now);
    return recent.length < this.limit ? 0 : Math.max(0, recent[0] + this.windowMs - now);
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  /** 清除所有窗口已过期的键。 */
  sweep(now: number = Date.now()): void {
    for (const key of Array.from(this.hits.keys())) this.prune(key, now);
  }

  get size(): number {
    return this.hits.size;
  }

  private prune(key: string, now: number): number[] {
    const recent = (this.hits.get(key) ?? []).filter(time => now - time < this.windowMs);
    if (recent.length) this.hits.set(key, recent);
    else this.hits.delete(key);
    return recent;
  }
}
