import { fail } from '../utils/response.js';

export function errorHandler(err, _req, res, _next) {
  console.error(err);
  const status = err.status || 500;
  const message = err.message || 'Internal server error';
  return fail(res, message, status, err.details);
}

export function notFound(_req, res) {
  return fail(res, 'Route not found', 404);
}
