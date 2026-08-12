export function toNumber(value) {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

export function formatUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    mobile: user.mobile,
    email: user.email || null,
    role: user.role,
    isActive: user.isActive,
    mustChangePassword: Boolean(user.mustChangePassword),
    employeeId: user.employee?.id ?? user.employeeId ?? null,
    employeeCode: user.employee?.employeeCode ?? null,
  };
}

export const ADMIN_ROLES = ['SUPER_ADMIN', 'HR_ADMIN', 'MANAGER'];
export const HR_ROLES = ['SUPER_ADMIN', 'HR_ADMIN'];

export function fullName(employee) {
  if (!employee) return '';
  return `${employee.firstName || ''} ${employee.lastName || ''}`.trim();
}

export function todayDateString(timeZone = 'Asia/Kolkata') {
  return new Date().toLocaleDateString('en-CA', { timeZone });
}

export function parseDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  const str = String(value).slice(0, 10);
  return new Date(`${str}T00:00:00.000Z`);
}

export function dateOnlyKey(value, timeZone = 'Asia/Kolkata') {
  if (!value) return todayDateString(timeZone);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Date(value).toLocaleDateString('en-CA', { timeZone });
}

export function minutesBetween(start, end) {
  if (!start || !end) return 0;
  return Math.max(0, Math.round((new Date(end) - new Date(start)) / 60000));
}

export function parseHm(hm) {
  const [h, m] = String(hm || '00:00').split(':').map(Number);
  return { h: h || 0, m: m || 0 };
}

export function combineDateAndTime(dateValue, hm, timeZone = 'Asia/Kolkata') {
  const key = dateOnlyKey(dateValue, timeZone);
  const { h, m } = parseHm(hm);
  const asIst = new Date(`${key}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+05:30`);
  return asIst;
}

export function formatTime(value) {
  if (!value) return null;
  return new Date(value).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}

export function weekdayIndex(dateValue) {
  const key = dateOnlyKey(dateValue);
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || null;
}

export function money(value) {
  return Number(Number(value || 0).toFixed(2));
}
