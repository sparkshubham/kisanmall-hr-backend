export function parsePagination(query, { defaultSize = 25, maxSize = 100 } = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(maxSize, Math.max(1, Number(query.pageSize) || defaultSize));
  const q = (query.q || '').toString().trim();
  const skip = (page - 1) * pageSize;
  return { page, pageSize, q, skip };
}

export function paginationMeta(total, page, pageSize) {
  return {
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize) || 1),
  };
}

export function paginated(rows, total, page, pageSize) {
  return { rows, ...paginationMeta(total, page, pageSize) };
}
