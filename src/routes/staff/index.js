import { Router } from 'express';
import authRoutes from '../auth.js';
import homeRoutes from './home.js';
import attendanceRoutes from './attendance.js';
import leavesRoutes from './leaves.js';
import tasksRoutes from './tasks.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/home', homeRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/leaves', leavesRoutes);
router.use('/tasks', tasksRoutes);

export default router;
