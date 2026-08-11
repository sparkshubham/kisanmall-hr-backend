import { Router } from 'express';
import authRoutes from '../auth.js';
import dashboardRoutes from './dashboard.js';
import employeesRoutes from './employees.js';
import mastersRoutes from './masters.js';
import shiftsRoutes from './shifts.js';
import attendanceRoutes from './attendance.js';
import leavesRoutes from './leaves.js';
import payrollRoutes from './payroll.js';
import tasksRoutes from './tasks.js';
import reportsRoutes from './reports.js';
import settingsRoutes from './settings.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/employees', employeesRoutes);
router.use('/masters', mastersRoutes);
router.use('/departments', mastersRoutes);
router.use('/shifts', shiftsRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/leaves', leavesRoutes);
router.use('/payroll', payrollRoutes);
router.use('/tasks', tasksRoutes);
router.use('/reports', reportsRoutes);
router.use('/settings', settingsRoutes);

export default router;
