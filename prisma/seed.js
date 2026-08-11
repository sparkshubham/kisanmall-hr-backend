import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function dateOnly(offsetDays = 0) {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  ist.setDate(ist.getDate() + offsetDays);
  return new Date(Date.UTC(ist.getFullYear(), ist.getMonth(), ist.getDate()));
}

function atTime(dateObj, hm) {
  const [h, m] = hm.split(':').map(Number);
  const key = dateObj.toISOString().slice(0, 10);
  return new Date(`${key}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+05:30`);
}

async function main() {
  const adminHash = await bcrypt.hash('admin123', 10);
  const staffHash = await bcrypt.hash('staff123', 10);

  const departments = await Promise.all(
    [
      { name: 'Operations', code: 'OPS' },
      { name: 'Sales', code: 'SAL' },
      { name: 'Inventory', code: 'INV' },
      { name: 'Cashier', code: 'CSH' },
      { name: 'Housekeeping', code: 'HK' },
    ].map((d) =>
      prisma.department.upsert({
        where: { name: d.name },
        update: {},
        create: d,
      })
    )
  );

  const designations = await Promise.all(
    ['Store Supervisor', 'Floor Staff', 'Cashier', 'Sales Associate', 'Inventory Executive', 'Housekeeper'].map(
      (name) => prisma.designation.upsert({ where: { name }, update: {}, create: { name } })
    )
  );

  const locations = await Promise.all(
    [
      { name: 'Main Store', code: 'MAIN' },
      { name: 'Back Store', code: 'BACK' },
      { name: 'Godown', code: 'GDN' },
      { name: 'Office', code: 'OFF' },
    ].map((l) => prisma.location.upsert({ where: { name: l.name }, update: {}, create: l }))
  );

  const shiftA = await prisma.shift.upsert({
    where: { name: 'Shift A' },
    update: {},
    create: {
      name: 'Shift A',
      code: 'A',
      startTime: '06:00',
      endTime: '16:00',
      graceMinutes: 10,
      breakMinutes: 60,
    },
  });
  const shiftB = await prisma.shift.upsert({
    where: { name: 'Shift B' },
    update: {},
    create: {
      name: 'Shift B',
      code: 'B',
      startTime: '10:30',
      endTime: '20:30',
      graceMinutes: 10,
      breakMinutes: 60,
    },
  });
  const shiftC = await prisma.shift.upsert({
    where: { name: 'Shift C' },
    update: {},
    create: {
      name: 'Shift C',
      code: 'C',
      startTime: '13:00',
      endTime: '22:30',
      graceMinutes: 10,
      breakMinutes: 45,
    },
  });

  const leaveTypes = [
    { name: 'Casual Leave', code: 'CL', annualQuota: 10, isPaid: true },
    { name: 'Sick Leave', code: 'SL', annualQuota: 6, isPaid: true },
    { name: 'Paid Leave', code: 'PL', annualQuota: 10, isPaid: true },
    { name: 'Unpaid Leave', code: 'UNPAID', annualQuota: 0, isPaid: false },
    { name: 'Emergency Leave', code: 'EL', annualQuota: 3, isPaid: true },
    { name: 'Other', code: 'OTHER', annualQuota: 0, isPaid: false },
  ];
  for (const t of leaveTypes) {
    await prisma.leaveType.upsert({ where: { code: t.code }, update: {}, create: t });
  }
  const allLeaveTypes = await prisma.leaveType.findMany();

  await prisma.user.upsert({
    where: { mobile: '9999999999' },
    update: {},
    create: {
      name: 'Super Admin',
      mobile: '9999999999',
      email: 'admin@kisanmall.in',
      passwordHash: adminHash,
      role: 'SUPER_ADMIN',
    },
  });

  await prisma.user.upsert({
    where: { mobile: '9999999998' },
    update: {},
    create: {
      name: 'HR Admin',
      mobile: '9999999998',
      email: 'hr@kisanmall.in',
      passwordHash: adminHash,
      role: 'HR_ADMIN',
    },
  });

  const staffList = [
    { code: 'KM001', first: 'Ramesh', last: 'Patil', mobile: '9000000001', dept: 0, loc: 0, shift: shiftA, desig: 0, type: 'FULL_TIME', salary: 28000 },
    { code: 'KM002', first: 'Suresh', last: 'Jadhav', mobile: '9000000002', dept: 2, loc: 2, shift: shiftA, desig: 4, type: 'FULL_TIME', salary: 24000 },
    { code: 'KM003', first: 'Babu', last: 'Shaikh', mobile: '9000000003', dept: 0, loc: 0, shift: shiftC, desig: 1, type: 'FULL_TIME', salary: 22000 },
    { code: 'KM004', first: 'Manish', last: 'Kale', mobile: '9000000004', dept: 3, loc: 0, shift: shiftB, desig: 2, type: 'FULL_TIME', salary: 21000 },
    { code: 'KM005', first: 'Kanchan', last: 'More', mobile: '9000000005', dept: 1, loc: 0, shift: shiftA, desig: 3, type: 'FULL_TIME', salary: 23000 },
    { code: 'KM006', first: 'Ashok', last: 'Deshmukh', mobile: '9000000006', dept: 0, loc: 1, shift: shiftB, desig: 1, type: 'FULL_TIME', salary: 22000 },
    { code: 'KM007', first: 'Pooja', last: 'Singh', mobile: '9000000007', dept: 1, loc: 0, shift: shiftA, desig: 3, type: 'FULL_TIME', salary: 25000 },
    { code: 'KM008', first: 'Ashish', last: 'Verma', mobile: '9000000008', dept: 2, loc: 2, shift: shiftB, desig: 4, type: 'FULL_TIME', salary: 24000 },
    { code: 'KM009', first: 'Neha', last: 'Kulkarni', mobile: '9000000009', dept: 3, loc: 0, shift: shiftA, desig: 2, type: 'PART_TIME', salary: 14000 },
    { code: 'KM010', first: 'Vikas', last: 'Shinde', mobile: '9000000010', dept: 0, loc: 0, shift: shiftC, desig: 1, type: 'FULL_TIME', salary: 22000 },
    { code: 'KM011', first: 'Priya', last: 'Nair', mobile: '9000000011', dept: 1, loc: 0, shift: shiftB, desig: 3, type: 'FULL_TIME', salary: 24000 },
    { code: 'KM012', first: 'Rahul', last: 'Yadav', mobile: '9000000012', dept: 4, loc: 1, shift: shiftA, desig: 5, type: 'CONTRACT', salary: 16000 },
    { code: 'KM013', first: 'Sunita', last: 'Pawar', mobile: '9000000013', dept: 4, loc: 0, shift: shiftB, desig: 5, type: 'FULL_TIME', salary: 18000 },
    { code: 'KM014', first: 'Mukesh', last: 'Kumar', mobile: '9000000014', dept: 0, loc: 0, shift: shiftB, desig: 1, type: 'FULL_TIME', salary: 25000 },
    { code: 'KM015', first: 'Anita', last: 'Joshi', mobile: '9000000015', dept: 3, loc: 0, shift: shiftC, desig: 2, type: 'FULL_TIME', salary: 21000 },
    { code: 'KM016', first: 'Deepak', last: 'Mane', mobile: '9000000016', dept: 2, loc: 2, shift: shiftA, desig: 4, type: 'FULL_TIME', salary: 23000 },
    { code: 'KM017', first: 'Kavita', last: 'Rane', mobile: '9000000017', dept: 1, loc: 0, shift: shiftC, desig: 3, type: 'TEMPORARY', salary: 15000 },
    { code: 'KM018', first: 'Sanjay', last: 'Gupta', mobile: '9000000018', dept: 0, loc: 3, shift: shiftB, desig: 0, type: 'FULL_TIME', salary: 32000, role: 'MANAGER' },
    { code: 'KM019', first: 'Meena', last: 'Shah', mobile: '9000000019', dept: 1, loc: 0, shift: shiftA, desig: 3, type: 'FULL_TIME', salary: 24000 },
    { code: 'KM020', first: 'Imran', last: 'Khan', mobile: '9000000020', dept: 0, loc: 1, shift: shiftC, desig: 1, type: 'FULL_TIME', salary: 22000 },
  ];

  const employees = [];
  for (const s of staffList) {
    const user = await prisma.user.upsert({
      where: { mobile: s.mobile },
      update: {},
      create: {
        name: `${s.first} ${s.last}`,
        mobile: s.mobile,
        passwordHash: staffHash,
        role: s.role || 'STAFF',
      },
    });

    const employee = await prisma.employee.upsert({
      where: { employeeCode: s.code },
      update: {},
      create: {
        employeeCode: s.code,
        userId: user.id,
        firstName: s.first,
        lastName: s.last,
        mobile: s.mobile,
        joiningDate: dateOnly(-180),
        departmentId: departments[s.dept].id,
        designationId: designations[s.desig].id,
        locationId: locations[s.loc].id,
        shiftId: s.shift.id,
        employeeType: s.type,
        basicSalary: s.salary,
        allowances: 3000,
        overtimeRate: 120,
        gender: ['Pooja', 'Kanchan', 'Neha', 'Priya', 'Sunita', 'Anita', 'Kavita', 'Meena'].includes(s.first)
          ? 'FEMALE'
          : 'MALE',
      },
    });
    employees.push(employee);

    await prisma.leaveBalance.createMany({
      data: allLeaveTypes.map((t) => ({
        employeeId: employee.id,
        leaveTypeId: t.id,
        year: new Date().getFullYear(),
        entitled: t.annualQuota,
        used: t.code === 'CL' ? 4 : t.code === 'PL' ? 2 : t.code === 'SL' ? 1 : 0,
      })),
      skipDuplicates: true,
    });
  }

  const manager = employees.find((e) => e.employeeCode === 'KM018');
  if (manager) {
    await prisma.employee.updateMany({
      where: { employeeCode: { in: ['KM003', 'KM006', 'KM014', 'KM010', 'KM020'] } },
      data: { reportingManagerId: manager.id },
    });
  }

  const today = dateOnly(0);
  const mukesh = employees.find((e) => e.employeeCode === 'KM014');
  const pooja = employees.find((e) => e.employeeCode === 'KM007');
  const babu = employees.find((e) => e.employeeCode === 'KM003');
  const ashish = employees.find((e) => e.employeeCode === 'KM008');

  const todayPlan = {
    KM014: { in: '10:28', out: null, late: 0, status: 'WORKING' },
    KM007: { in: '06:02', out: '16:03', late: 0, status: 'PRESENT' },
    KM003: { in: '13:14', out: null, late: 14, status: 'WORKING' },
    KM001: { in: '05:58', out: null, late: 0, status: 'WORKING' },
    KM002: { in: '06:05', out: null, late: 0, status: 'WORKING' },
    KM004: { in: '10:41', out: null, late: 1, status: 'WORKING' },
    KM005: { in: '06:00', out: null, late: 0, status: 'WORKING' },
    KM006: { in: '10:35', out: null, late: 0, status: 'WORKING' },
    KM009: { in: '06:12', out: null, late: 2, status: 'WORKING' },
    KM010: { in: '13:02', out: null, late: 0, status: 'WORKING' },
    KM011: { in: '10:52', out: null, late: 12, status: 'WORKING' },
    KM012: { in: '06:08', out: null, late: 0, status: 'WORKING' },
    KM013: { in: '10:29', out: null, late: 0, status: 'WORKING' },
    KM015: { in: '13:00', out: null, late: 0, status: 'WORKING' },
    KM016: { in: '06:04', out: null, late: 0, status: 'WORKING' },
    KM017: { in: null, out: null, late: 0, status: 'ABSENT' },
    KM018: { in: '10:20', out: null, late: 0, status: 'WORKING' },
    KM019: { in: '06:01', out: null, late: 0, status: 'WORKING' },
    KM020: { in: null, out: null, late: 0, status: 'ABSENT' },
    KM008: { in: null, out: null, late: 0, status: 'LEAVE' },
  };

  for (const emp of employees) {
    const plan = todayPlan[emp.employeeCode];
    if (!plan) continue;
    await prisma.attendance.upsert({
      where: { employeeId_date: { employeeId: emp.id, date: today } },
      update: {},
      create: {
        employeeId: emp.id,
        locationId: emp.locationId,
        shiftId: emp.shiftId,
        date: today,
        checkIn: plan.in ? atTime(today, plan.in) : null,
        checkOut: plan.out ? atTime(today, plan.out) : null,
        lateMinutes: plan.late,
        status: plan.status,
        faceVerified: Boolean(plan.in),
        workingMinutes: plan.in && plan.out ? 601 : 0,
      },
    });

    for (let i = 1; i <= 7; i += 1) {
      const d = dateOnly(-i);
      const late = i === 5 && emp.employeeCode === 'KM014';
      await prisma.attendance.upsert({
        where: { employeeId_date: { employeeId: emp.id, date: d } },
        update: {},
        create: {
          employeeId: emp.id,
          locationId: emp.locationId,
          shiftId: emp.shiftId,
          date: d,
          checkIn: atTime(d, late ? '10:52' : emp.shiftId === shiftA.id ? '06:04' : emp.shiftId === shiftC.id ? '13:02' : '10:28'),
          checkOut: atTime(d, emp.shiftId === shiftA.id ? '16:05' : emp.shiftId === shiftC.id ? '22:32' : '20:32'),
          lateMinutes: late ? 12 : 0,
          status: late ? 'LATE' : 'PRESENT',
          faceVerified: true,
          workingMinutes: 600,
        },
      });
    }
  }

  if (ashish) {
    const cl = allLeaveTypes.find((t) => t.code === 'CL');
    await prisma.leaveRequest.create({
      data: {
        employeeId: ashish.id,
        leaveTypeId: cl.id,
        fromDate: today,
        toDate: today,
        days: 1,
        reason: 'Personal work',
        status: 'APPROVED',
      },
    });
  }

  if (pooja) {
    const cl = allLeaveTypes.find((t) => t.code === 'CL');
    await prisma.leaveRequest.create({
      data: {
        employeeId: pooja.id,
        leaveTypeId: cl.id,
        fromDate: dateOnly(4),
        toDate: dateOnly(5),
        days: 2,
        reason: 'Personal',
        status: 'PENDING',
      },
    });
  }

  if (mukesh) {
    await prisma.task.create({
      data: {
        title: 'Check produce racks',
        description: 'Verify freshness labels on vegetable racks before evening rush.',
        employeeId: mukesh.id,
        departmentId: departments[0].id,
        locationId: locations[0].id,
        priority: 'HIGH',
        status: 'IN_PROGRESS',
        dueDate: today,
      },
    });
  }

  await prisma.systemSetting.upsert({
    where: { key: 'graceMinutes' },
    update: {},
    create: { key: 'graceMinutes', value: 10 },
  });
  await prisma.systemSetting.upsert({
    where: { key: 'requireFace' },
    update: {},
    create: { key: 'requireFace', value: true },
  });

  console.log('Seed complete');
  console.log('Super Admin : 9999999999 / admin123');
  console.log('HR Admin    : 9999999998 / admin123');
  console.log('Manager     : 9000000018 / staff123  (Sanjay Gupta)');
  console.log('Staff       : 9000000014 / staff123  (Mukesh Kumar KM014)');
  console.log('Staff       : 9000000007 / staff123  (Pooja Singh KM007)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
