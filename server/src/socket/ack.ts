import type { Socket } from 'socket.io';

export interface AckResponse {
  code: number;
  message?: string;
  [key: string]: unknown;
}
export type AckCallback = (response: AckResponse) => void;

/** 携带业务状态码的动作错误，例如房间不存在返回 404。 */
export class SocketActionError extends Error {
  constructor(message: string, public readonly code: number = 400) {
    super(message);
    this.name = 'SocketActionError';
  }
}

/** 客户端负载必须是普通对象；null、数组或基本类型统一视为空对象，交由业务层校验。 */
export function asPayload(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/**
 * 仅把业务层主动抛出的错误文案返回给客户端；
 * TypeError 等运行时异常不暴露内部细节，统一使用兜底文案并记录日志。
 */
export function toClientError(error: unknown, fallbackMessage: string): AckResponse {
  if (error instanceof SocketActionError) return { code: error.code, message: error.message };
  if (error instanceof Error && error.constructor === Error && error.message) return { code: 400, message: error.message };
  console.error(`[Socket] ${fallbackMessage}:`, error);
  return { code: 400, message: fallbackMessage };
}

/**
 * 注册带确认回调的 Socket 动作。
 * - 回调总是取最后一个函数参数，兼容 `emit(event, cb)` 与 `emit(event, data, cb)` 两种形式；
 * - 成功时回复 handler 返回值（默认 `{ code: 200 }`），通过 afterAck 登记的任务在回调之后执行；失败时有回调则回调，否则向本连接发送 `error` 事件。
 */
export function onAction(
  socket: Socket,
  event: string,
  fallbackMessage: string,
  handler: (data: Record<string, unknown>, afterAck: (task: () => void) => void) => AckResponse | void,
): void {
  socket.on(event, (...args: unknown[]) => {
    const last = args[args.length - 1];
    const callback = typeof last === 'function' ? last as AckCallback : undefined;
    const data = asPayload(typeof args[0] === 'function' ? undefined : args[0]);
    const deferred: Array<() => void> = [];
    try {
      const result = handler(data, task => { deferred.push(task); }) ?? { code: 200 };
      callback?.(result);
    } catch (error) {
      const response = toClientError(error, fallbackMessage);
      if (callback) callback(response);
      else socket.emit('error', response);
      return;
    }
    // 保持“先确认、后广播”的既有时序：广播等收尾动作在回调之后执行。
    for (const task of deferred) task();
  });
}
