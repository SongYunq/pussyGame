import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err);
    return;
  }
  const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
  // 不打印解析失败的请求体或内部异常对象，避免密码等字段进入日志。
  console.error('[ErrorHandler] 请求失败:', { method: req.method, path: req.path, status, type: err?.type || 'internal' });
  const message = err?.type === 'entity.parse.failed' ? '请求体必须为有效 JSON' :
    err?.type === 'entity.too.large' ? '请求体过大' : '服务器内部错误';
  res.status(status).json({
    code: status,
    message,
    data: null,
  });
}
