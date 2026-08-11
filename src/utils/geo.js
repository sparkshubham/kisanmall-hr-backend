/**
 * Haversine distance in meters between two WGS84 points.
 */
export function distanceMeters(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (Number(d) * Math.PI) / 180;
  const R = 6371000;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(Number(lat2) - Number(lat1));
  const Δλ = toRad(Number(lng2) - Number(lng1));
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/**
 * Resolve the mall/store location used for attendance geofence.
 * Prefers employee.location, else active Main Store / first active location with coords.
 */
export async function resolveAttendanceLocation(prisma, employee) {
  if (employee?.locationId) {
    const loc = employee.location || (await prisma.location.findUnique({ where: { id: employee.locationId } }));
    if (loc?.latitude != null && loc?.longitude != null) return loc;
  }

  const main = await prisma.location.findFirst({
    where: {
      isActive: true,
      latitude: { not: null },
      longitude: { not: null },
      OR: [{ code: 'MAIN' }, { name: { contains: 'Main', mode: 'insensitive' } }],
    },
  });
  if (main) return main;

  return prisma.location.findFirst({
    where: { isActive: true, latitude: { not: null }, longitude: { not: null } },
    orderBy: { id: 'asc' },
  });
}

/**
 * Assert device GPS is inside the store radius.
 * Throws Error with .status = 403 when outside / missing.
 */
export function assertInsideGeofence({ latitude, longitude, location, required = true }) {
  if (!required) return { skipped: true };

  if (latitude == null || longitude == null || Number.isNaN(Number(latitude)) || Number.isNaN(Number(longitude))) {
    const err = new Error('Location permission is required. Enable GPS and try again inside Kisan Mall.');
    err.status = 400;
    throw err;
  }

  if (!location || location.latitude == null || location.longitude == null) {
    const err = new Error('Store location is not configured. Ask admin to set Main Store latitude/longitude.');
    err.status = 500;
    throw err;
  }

  const radiusM = Number(location.radiusM ?? 150);
  const dist = distanceMeters(latitude, longitude, location.latitude, location.longitude);
  if (dist > radiusM) {
    const err = new Error(
      `You are outside Kisan Mall (${dist}m away). Attendance is allowed only within ${radiusM}m of ${location.name}.`
    );
    err.status = 403;
    err.meta = { distanceM: dist, radiusM, locationId: location.id, locationName: location.name };
    throw err;
  }

  return { distanceM: dist, radiusM, locationId: location.id, locationName: location.name, ok: true };
}
