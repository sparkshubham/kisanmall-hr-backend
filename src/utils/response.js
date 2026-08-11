export function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}

export function fail(res, message, status = 400, details) {
  return res.status(status).json({
    success: false,
    error: message,
    message,
    details,
  });
}

export function paginate(rows, { page = 1, limit = 20, total }) {
  return {
    items: rows,
    rows,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total: Number(total),
      pages: Math.ceil(total / limit) || 1,
    },
    total: Number(total),
    page: Number(page),
    pageSize: Number(limit),
    totalPages: Math.ceil(total / limit) || 1,
  };
}
