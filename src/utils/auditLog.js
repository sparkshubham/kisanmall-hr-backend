import prisma from './prisma.js';
import { clientIp } from './helpers.js';

export async function writeAudit(req, { action, entity, entityId, oldData, newData, reason }) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: req.user?.id || null,
        action,
        entity,
        entityId: entityId ?? null,
        ipAddress: clientIp(req),
        oldData: oldData ?? undefined,
        newData: newData ?? undefined,
        reason: reason || null,
      },
    });
  } catch (err) {
    console.error('audit log failed:', err.message);
  }
}

export async function notify(userId, { title, body, type, meta, actorId }) {
  if (!userId) return;
  try {
    await prisma.notification.create({
      data: {
        userId,
        title,
        body,
        type,
        meta: meta ?? undefined,
        actorId: actorId || null,
      },
    });
  } catch (err) {
    console.error('notify failed:', err.message);
  }
}
