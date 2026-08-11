import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import '../src/config/env.js';

const prisma = new PrismaClient();

/** Default Main Store pin — update in Admin → Masters → Locations if needed. */
const MAIN_STORE = {
  name: 'Main Store',
  code: 'MAIN',
  address: 'Kisan Mall',
  // Override with MALL_LAT / MALL_LNG / MALL_RADIUS_M env vars
  latitude: Number(process.env.MALL_LAT || 19.9975),
  longitude: Number(process.env.MALL_LNG || 73.7898),
  radiusM: Number(process.env.MALL_RADIUS_M || 150),
};

async function wipeHrData() {
  // Child tables first (schema hr)
  await prisma.attendanceLog.deleteMany();
  await prisma.attendanceCorrection.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.roster.deleteMany();
  await prisma.leaveRequest.deleteMany();
  await prisma.leaveBalance.deleteMany();
  await prisma.taskComment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.payroll.deleteMany();
  await prisma.employeeDocument.deleteMany();
  await prisma.faceRegistration.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.user.deleteMany();
  await prisma.leaveType.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.location.deleteMany();
  await prisma.designation.deleteMany();
  await prisma.department.deleteMany();
  await prisma.systemSetting.deleteMany();
}

async function main() {
  console.log('Wiping existing HR records…');
  await wipeHrData();

  const adminHash = await bcrypt.hash('admin123', 10);
  const staffHash = await bcrypt.hash('staff123', 10);

  const department = await prisma.department.create({
    data: { name: 'Operations', code: 'OPS' },
  });
  const designation = await prisma.designation.create({
    data: { name: 'Floor Staff' },
  });
  const location = await prisma.location.create({
    data: {
      name: MAIN_STORE.name,
      code: MAIN_STORE.code,
      address: MAIN_STORE.address,
      latitude: MAIN_STORE.latitude,
      longitude: MAIN_STORE.longitude,
      radiusM: MAIN_STORE.radiusM,
      isActive: true,
    },
  });
  const shift = await prisma.shift.create({
    data: {
      name: 'Shift B',
      code: 'B',
      startTime: '10:30',
      endTime: '20:30',
      graceMinutes: 10,
      breakMinutes: 60,
      workingDays: [1, 2, 3, 4, 5, 6],
    },
  });

  const leaveTypes = [
    { name: 'Casual Leave', code: 'CL', annualQuota: 10, isPaid: true },
    { name: 'Sick Leave', code: 'SL', annualQuota: 6, isPaid: true },
    { name: 'Paid Leave', code: 'PL', annualQuota: 10, isPaid: true },
    { name: 'Unpaid Leave', code: 'UNPAID', annualQuota: 0, isPaid: false },
  ];
  for (const t of leaveTypes) {
    await prisma.leaveType.create({ data: t });
  }
  const allLeaveTypes = await prisma.leaveType.findMany();

  const admin = await prisma.user.create({
    data: {
      name: 'Super Admin',
      mobile: '9999999999',
      email: 'admin@kisanmall.in',
      passwordHash: adminHash,
      role: 'SUPER_ADMIN',
    },
  });

  const staffUser = await prisma.user.create({
    data: {
      name: 'Shubham',
      mobile: '9000000001',
      email: 'shubham@kisanmall.in',
      passwordHash: staffHash,
      role: 'STAFF',
    },
  });

  const staff = await prisma.employee.create({
    data: {
      employeeCode: 'KM001',
      userId: staffUser.id,
      firstName: 'Shubham',
      lastName: '',
      mobile: '9000000001',
      email: 'shubham@kisanmall.in',
      departmentId: department.id,
      designationId: designation.id,
      locationId: location.id,
      shiftId: shift.id,
      employeeType: 'FULL_TIME',
      status: 'ACTIVE',
      gender: 'MALE',
      basicSalary: 25000,
      allowances: 2000,
      overtimeRate: 120,
    },
  });

  await prisma.leaveBalance.createMany({
    data: allLeaveTypes.map((t) => ({
      employeeId: staff.id,
      leaveTypeId: t.id,
      year: new Date().getFullYear(),
      entitled: t.annualQuota,
      used: 0,
    })),
  });

  await prisma.systemSetting.createMany({
    data: [
      { key: 'graceMinutes', value: 10 },
      { key: 'requireFace', value: true },
      { key: 'requireGeofence', value: true },
      { key: 'mallName', value: 'Kisan Mall' },
    ],
  });

  console.log('Seed complete — only Admin + Staff Shubham');
  console.log('────────────────────────────────────────');
  console.log(`Admin  : ${admin.mobile} / admin123`);
  console.log(`Staff  : ${staffUser.mobile} / staff123  (Shubham · ${staff.employeeCode})`);
  console.log(
    `Geofence: ${location.name} @ ${location.latitude}, ${location.longitude} · radius ${location.radiusM}m`
  );
  console.log('Update coords in Admin → Masters → Locations if needed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
