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
    const { mobile, email, password, portal } = req.body;
    if ((!mobile && !email) || !password) {
      return fail(res, 'Mobile/email and password are required', 400);
    }

    const identifier = String(mobile || email).trim();
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ mobile: identifier }, { email: identifier }],
      },
      include: {
        employee: {
          select: { id: true, employeeCode: true, firstName: true, lastName: true, status: true },
        },
      },
    });

    if (!user || !user.isActive) {
      return fail(res, 'Invalid mobile or password', 401);
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return fail(res, 'Invalid mobile or password', 401);
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

    await writeAudit(req, {
      action: 'LOGIN',
      entity: 'User',
      entityId: user.id,
      newData: { portal: portal || 'auto', role: user.role },
    });

    return res.json({
      success: true,
      token,
      user: formatUser(user),
      data: { token, user: formatUser(user) },
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

export default router;
