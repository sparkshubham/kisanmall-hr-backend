import { fail } from '../utils/response.js';
import { verifyToken } from '../utils/jwt.js';
import prisma from '../utils/prisma.js';
import { ADMIN_ROLES, HR_ROLES } from '../utils/helpers.js';

function extractToken(req) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return null;
}

/** Shared JWT auth — sets req.user */
export function authenticate(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) return fail(res, 'Authentication required', 401);
    req.user = verifyToken(token);
    next();
  } catch {
    return fail(res, 'Invalid or expired token', 401);
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return fail(res, 'Access denied', 403);
    }
    next();
  };
}

export async function attachUser(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        mobile: true,
        email: true,
        role: true,
        isActive: true,
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            status: true,
            departmentId: true,
            locationId: true,
            shiftId: true,
            photoUrl: true,
          },
        },
      },
    });
    if (!user || !user.isActive) {
      return fail(res, 'User inactive or not found', 401);
    }
    req.currentUser = user;
    req.employee = user.employee;
    next();
  } catch (err) {
    next(err);
  }
}

export function authAdmin(req, res, next) {
  authenticate(req, res, () => {
    if (!ADMIN_ROLES.includes(req.user?.role)) return fail(res, 'Admin access required', 403);
    next();
  });
}

export function authHr(req, res, next) {
  authenticate(req, res, () => {
    if (!HR_ROLES.includes(req.user?.role)) return fail(res, 'HR access required', 403);
    next();
  });
}

export function authStaff(req, res, next) {
  authenticate(req, res, () => {
    if (!req.user) return fail(res, 'Staff access required', 403);
    next();
  });
}

export async function attachEmployee(req, res, next) {
  try {
    // Omit face.embedding here — load it only on check-in / register-face routes
    const employee = await prisma.employee.findUnique({
      where: { userId: req.user.id },
      include: {
        department: true,
        designation: true,
        location: true,
        shift: true,
        face: { select: { id: true, employeeId: true, status: true, registeredAt: true, updatedAt: true } },
      },
    });
    if (!employee) return fail(res, 'Employee profile not found', 404);
    req.employee = employee;
    next();
  } catch (err) {
    next(err);
  }
}
