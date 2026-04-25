// Tiny wrapper to record an admin action. Failure-tolerant — admin operations
// MUST not break because logging fails.

import AdminAction from '../models/AdminAction.js';

export async function logAdminAction(adminId, action, targetType, targetId, data = {}) {
  if (!adminId || !action) return null;
  try {
    const row = await AdminAction.create({
      adminId,
      action,
      targetType: targetType || '',
      targetId: targetId ? String(targetId) : '',
      data: data || {},
    });
    console.log(`[admin-log] ${action} target=${targetType}:${targetId}`);
    return row;
  } catch (err) {
    console.error('[admin-log] failed:', err.message);
    return null;
  }
}

export default logAdminAction;
