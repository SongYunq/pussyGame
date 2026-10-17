export function isRequestBody(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isTrimmedText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 &&
    value.trim().length <= maxLength && !/[\u0000-\u001f\u007f]/u.test(value);
}

export function isPassword(value: unknown, minimumLength = 6): value is string {
  return typeof value === 'string' && value.length >= minimumLength &&
    value.trim().length > 0 && !value.includes('\0') && Buffer.byteLength(value, 'utf8') <= 72;
}

export function parsePositiveInteger(value: unknown): number | null {
  if (typeof value !== 'string' || !/^[1-9]\d*$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function parsePagination(
  pageValue: unknown,
  pageSizeValue: unknown,
  defaultPageSize: number
): { page: number; pageSize: number } | null {
  const page = pageValue === undefined ? 1 : parsePositiveInteger(pageValue);
  const pageSize = pageSizeValue === undefined ? defaultPageSize : parsePositiveInteger(pageSizeValue);
  if (page === null || pageSize === null || pageSize > 100 ||
      !Number.isSafeInteger((page - 1) * pageSize)) return null;
  return { page, pageSize };
}
