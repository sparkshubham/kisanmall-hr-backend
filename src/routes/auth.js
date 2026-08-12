import { Router } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../utils/prisma.js';
import { authenticate, attachUser } from '../middleware/auth.js';
import { ADMIN_ROLES, formatUser } from '../utils/helpers.js';
import { signToken } from '../utils/jwt.js';
import { fail } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { writeAudit } from '../utils/auditLog.js';

const router = Router();

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { mobile, email, username, password, portal } = req.body;
    if ((!mobile && !email && !username) || !password) {
      return fail(res, 'Username/mobile/email and password are required', 400);
    }

    const identifier = String(mobile || email || username).trim();
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { mobile: identifier },
          { email: identifier },
          { employee: { employeeCode: { equals: identifier, mode: 'insensitive' } } },
        ],
      },
      include: {
        employee: {
          select: { id: true, employeeCode: true, firstName: true, lastName: true, status: true },
        },
      },
    });

    if (!user || !user.isActive) {
      return fail(res, 'Invalid username or password', 401);
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return fail(res, 'Invalid username or password', 401);
    }

    if (portal === 'admin' && !ADMIN_ROLES.includes(user.role)) {
      return fail(res, 'Admin access required. Use Staff Login.', 403);
    }
    if (portal === 'staff' && !user.employee) {
      return fail(res, 'Staff profile not found. Use Admin Login.', 403);
    }

    const token = signToken({
      id: user.id,
      role: user.role,
      name: user.name,
      mobile: user.mobile,
    });

    void writeAudit(req, {
      action: 'LOGIN',
      entity: 'User',
      entityId: user.id,
      newData: { portal: portal || 'auto', role: user.role },
    });

    const formatted = formatUser(user);
    return res.json({
      success: true,
      token,
      user: formatted,
      data: { token, user: formatted },
    });
  })
);

router.get('/me', authenticate, attachUser, (req, res) => {
  return res.json({
    success: true,
    user: formatUser(req.currentUser),
    data: { user: formatUser(req.currentUser) },
  });
});

router.post(
  '/change-password',
  authenticate,
  attachUser,
  asyncHandler(async (req, res) => {
    const currentPassword = String(req.body.currentPassword || '');
    const newPassword = String(req.body.newPassword || '');
    const confirmPassword = String(req.body.confirmPassword || '');

    if (!currentPassword || !newPassword) {
      return fail(res, 'Current password and new password are required', 400);
    }
    if (newPassword.length < 6) {
      return fail(res, 'New password must be at least 6 characters', 400);
    }
    if (confirmPassword && confirmPassword !== newPassword) {
      return fail(res, 'New password and confirm password do not match', 400);
    }
    if (currentPassword === newPassword) {
      return fail(res, 'New password must be different from current password', 400);
    }

    const dbUser = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!dbUser) return fail(res, 'User not found', 404);

    const valid = await bcrypt.compare(currentPassword, dbUser.passwordHash);
    if (!valid) return fail(res, 'Current password is incorrect', 400);

    const updated = await prisma.user.update({
      where: { id: dbUser.id },
      data: {
        passwordHash: await bcrypt.hash(newPassword, 10),
        mustChangePassword: false,
      },
      include: {
        employee: {
          select: { id: true, employeeCode: true, firstName: true, lastName: true, status: true },
        },
      },
    });

    void writeAudit(req, {
      action: 'PASSWORD_CHANGED',
      entity: 'User',
      entityId: updated.id,
      newData: { mustChangePassword: false },
    });

    return res.json({
      success: true,
      message: 'Password updated successfully',
      user: formatUser(updated),
      data: { user: formatUser(updated) },
    });
  })
);

export default router;
