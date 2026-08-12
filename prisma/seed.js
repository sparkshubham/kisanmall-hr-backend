import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import '../src/config/env.js';

const prisma = new PrismaClient();

/** Default Main Store pin — update in Admin → Masters → Locations if needed. */
const MAIN_STORE = {
  name: 'Main Store',
  code: 'MAIN',
  address: 'Kisan Mall',
  latitude: Number(process.env.MALL_LAT || 19.9975),
  longitude: Number(process.env.MALL_LNG || 73.7898),
  radiusM: Number(process.env.MALL_RADIUS_M || 150),
};

/** Login username = kisan + firstName (lowercase), e.g. kisanshubham */
function loginCode(firstName) {
  return `kisan${String(firstName).trim().toLowerCase().replace(/\s+/g, '')}`;
}

async function wipeHrData() {
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
  const staffHash = await bcrypt.hash('kisan123', 10);

  const deptAdmin = await prisma.department.create({ data: { name: 'Administration', code: 'ADMIN' } });
  const deptFloor = await prisma.department.create({ data: { name: 'Floor', code: 'FLOOR' } });
  const deptCounter = await prisma.department.create({ data: { name: 'Counter', code: 'COUNTER' } });

  const desigCto = await prisma.designation.create({ data: { name: 'CTO' } });
  const desigAdmin = await prisma.designation.create({ data: { name: 'Admin' } });
  const desigFloor = await prisma.designation.create({ data: { name: 'Floor Staff' } });
  const desigCounter = await prisma.designation.create({ data: { name: 'Counter Staff' } });
  const desigMetlor = await prisma.designation.create({ data: { name: 'Metlor Floor' } });

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

  const shiftOffice = await prisma.shift.create({
    data: {
      name: 'Office',
      code: 'OFFICE',
      startTime: '10:30',
      endTime: '20:30',
      graceMinutes: 10,
      breakMinutes: 60,
      workingDays: [1, 2, 3, 4, 5, 6],
    },
  });
  const shift12to9 = await prisma.shift.create({
    data: {
      name: '12–9 Floor',
      code: 'F129',
      startTime: '12:00',
      endTime: '21:00',
      graceMinutes: 10,
      breakMinutes: 60,
      workingDays: [1, 2, 3, 4, 5, 6],
    },
  });
  const shift12toClose = await prisma.shift.create({
    data: {
      name: '12–Close',
      code: 'F12C',
      startTime: '12:00',
      endTime: '22:00',
      graceMinutes: 10,
      breakMinutes: 60,
      workingDays: [1, 2, 3, 4, 5, 6],
    },
  });
  const shift11to9 = await prisma.shift.create({
    data: {
      name: '11–9 Floor',
      code: 'F119',
      startTime: '11:00',
      endTime: '21:00',
      graceMinutes: 10,
      breakMinutes: 60,
      workingDays: [1, 2, 3, 4, 5, 6],
    },
  });
  const shift12to10 = await prisma.shift.create({
    data: {
      name: '12–10 Floor',
      code: 'F1210',
      startTime: '12:00',
      endTime: '22:00',
      graceMinutes: 10,
      breakMinutes: 60,
      workingDays: [1, 2, 3, 4, 5, 6],
    },
  });
  const shift6to4 = await prisma.shift.create({
    data: {
      name: '6–4 Morning',
      code: 'M64',
      startTime: '06:00',
      endTime: '16:00',
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

  await prisma.user.create({
    data: {
      name: 'Super Admin',
      mobile: '9999999999',
      email: 'admin@kisanmall.in',
      passwordHash: adminHash,
      role: 'SUPER_ADMIN',
    },
  });

  /**
   * Team roster
   * Login: employeeCode = kisan + firstName (e.g. kisanshubham)
   * Password: kisan123 (admins & staff); Super Admin stays admin123
   */
  const team = [
    {
      firstName: 'Shubham',
      lastName: 'Soni',
      role: 'HR_ADMIN',
      departmentId: deptAdmin.id,
      designationId: desigCto.id,
      shiftId: shiftOffice.id,
      mobile: '9000000001',
      basicSalary: 45000,
      note: 'Admin · CTO',
    },
    {
      firstName: 'Dhruv',
      lastName: 'Soni',
      role: 'HR_ADMIN',
      departmentId: deptAdmin.id,
      designationId: desigAdmin.id,
      shiftId: shiftOffice.id,
      mobile: '9000000002',
      basicSalary: 40000,
      note: 'Admin',
    },
    {
      firstName: 'Sawan',
      lastName: 'Khatik',
      role: 'STAFF',
      departmentId: deptFloor.id,
      designationId: desigFloor.id,
      shiftId: shift12to9.id,
      mobile: '9000000003',
      basicSalary: 18000,
      note: 'Floor · 12–9',
    },
    {
      firstName: 'Durgesh',
      lastName: 'Jeenagar',
      role: 'STAFF',
      departmentId: deptFloor.id,
      designationId: desigFloor.id,
      shiftId: shift12to9.id,
      mobile: '9000000004',
      basicSalary: 18000,
      note: 'Floor · 12–9',
    },
    {
      firstName: 'Mukesh',
      lastName: 'Soni',
      role: 'HR_ADMIN',
      departmentId: deptAdmin.id,
      designationId: desigAdmin.id,
      shiftId: shift12toClose.id,
      mobile: '9000000005',
      basicSalary: 35000,
      note: 'Admin · 12–Close',
    },
    {
      firstName: 'Babu',
      lastName: 'Keer',
      role: 'STAFF',
      departmentId: deptFloor.id,
      designationId: desigFloor.id,
      shiftId: shift11to9.id,
      mobile: '9000000006',
      basicSalary: 18000,
      note: 'Floor · 11–9',
    },
    {
      firstName: 'Ashish',
      lastName: 'Meena',
      role: 'STAFF',
      departmentId: deptFloor.id,
      designationId: desigFloor.id,
      shiftId: shift12toClose.id,
      mobile: '9000000007',
      basicSalary: 18000,
      note: 'Floor · 12–Close',
    },
    {
      firstName: 'Bhupendra',
      lastName: 'Vaishnav',
      role: 'STAFF',
      departmentId: deptFloor.id,
      designationId: desigFloor.id,
      shiftId: shift12to10.id,
      mobile: '9000000008',
      basicSalary: 18000,
      note: 'Floor · 12–10',
    },
    {
      firstName: 'Manish',
      lastName: 'Khatik',
      role: 'STAFF',
      departmentId: deptCounter.id,
      designationId: desigCounter.id,
      shiftId: shift6to4.id,
      mobile: '9000000009',
      basicSalary: 18000,
      note: 'Counter · 6–4',
    },
    {
      firstName: 'Pooja',
      lastName: 'Shaktawat',
      role: 'STAFF',
      departmentId: deptFloor.id,
      designationId: desigFloor.id,
      shiftId: shift6to4.id,
      mobile: '9000000010',
      basicSalary: 18000,
      gender: 'FEMALE',
      note: 'Morning Floor · 6–4',
    },
    {
      firstName: 'Kanchan',
      lastName: 'Khatik',
      role: 'STAFF',
      departmentId: deptFloor.id,
      designationId: desigMetlor.id,
      shiftId: shift12to10.id,
      mobile: '9000000011',
      basicSalary: 18000,
      gender: 'FEMALE',
      note: 'Metlor Floor · 12–10',
    },
  ];

  const year = new Date().getFullYear();
  const created = [];

  for (const person of team) {
    const code = loginCode(person.firstName);
    const name = `${person.firstName} ${person.lastName}`.trim();
    const user = await prisma.user.create({
      data: {
        name,
        mobile: person.mobile,
        email: `${code}@kisanmall.in`,
        passwordHash: staffHash,
        role: person.role,
      },
    });

    const employee = await prisma.employee.create({
      data: {
        employeeCode: code,
        userId: user.id,
        firstName: person.firstName,
        lastName: person.lastName,
        mobile: person.mobile,
        email: `${code}@kisanmall.in`,
        departmentId: person.departmentId,
        designationId: person.designationId,
        locationId: location.id,
        shiftId: person.shiftId,
        employeeType: 'FULL_TIME',
        status: 'ACTIVE',
        gender: person.gender || 'MALE',
        basicSalary: person.basicSalary,
        allowances: 2000,
        overtimeRate: 120,
      },
    });

    await prisma.leaveBalance.createMany({
      data: allLeaveTypes.map((t) => ({
        employeeId: employee.id,
        leaveTypeId: t.id,
        year,
        entitled: t.annualQuota,
        used: 0,
      })),
    });

    created.push({
      name,
      code,
      mobile: person.mobile,
      role: person.role,
      note: person.note,
    });
  }

  await prisma.systemSetting.createMany({
    data: [
      { key: 'graceMinutes', value: 10 },
      { key: 'requireFace', value: true },
      { key: 'requireGeofence', value: true },
      { key: 'mallName', value: 'Kisan Mall' },
    ],
  });

  console.log('Seed complete — Kisan Mall team');
  console.log('────────────────────────────────────────');
  console.log('Super Admin : 9999999999 / admin123');
  console.log('Staff/Admin password : kisan123');
  console.log('Login with username (employee code):');
  for (const row of created) {
    console.log(`  ${row.code.padEnd(16)}  ${row.name.padEnd(22)}  ${row.role.padEnd(10)}  ${row.note}`);
  }
  console.log(
    `Geofence: ${location.name} @ ${location.latitude}, ${location.longitude} · radius ${location.radiusM}m`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
