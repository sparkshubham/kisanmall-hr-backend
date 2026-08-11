const MATCH_THRESHOLD = 0.48;
const UNIQUE_THRESHOLD = 0.42;

export function euclideanDistance(a = [], b = []) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) {
    return Number.POSITIVE_INFINITY;
  }
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = Number(a[i]) - Number(b[i]);
    sum += d * d;
  }
  return Math.sqrt(sum);
}

export function normalizeEmbedding(raw) {
  if (!Array.isArray(raw)) return null;
  const values = raw.map((n) => Number(n)).filter((n) => Number.isFinite(n));
  if (values.length < 64) return null;
  return values;
}

export function bestMatch(embedding, registrations = []) {
  let best = null;
  for (const row of registrations) {
    const stored = Array.isArray(row.embedding) ? row.embedding : [];
    const distance = euclideanDistance(embedding, stored);
    if (!best || distance < best.distance) {
      best = { registration: row, distance };
    }
  }
  if (!best) return null;
  const confidence = Math.max(0, Math.min(1, 1 - best.distance));
  return {
    ...best,
    matched: best.distance <= MATCH_THRESHOLD,
    confidence: Number(confidence.toFixed(4)),
  };
}

export function findDuplicate(embedding, registrations = [], ignoreEmployeeId) {
  const others = registrations.filter((row) => row.employeeId !== ignoreEmployeeId);
  const match = bestMatch(embedding, others);
  if (match && match.distance <= UNIQUE_THRESHOLD) return match;
  return null;
}

export const FACE_THRESHOLDS = { MATCH_THRESHOLD, UNIQUE_THRESHOLD };
