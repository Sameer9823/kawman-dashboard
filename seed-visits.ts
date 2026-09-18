import 'dotenv/config';
import { PrismaClient } from './src/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // Find the org that has the admin user (the one we log in as)
  const org = await prisma.organization.findFirst({
    where: { slug: 'my-company' }
  });
  if (!org) {
    console.log('Organization "my-company" not found');
    return;
  }
  console.log('Org:', org.name, org.id);

  const users = await prisma.user.findMany({ where: { organizationId: org.id } });
  console.log('Users:', users.map(u => ({ id: u.id, name: u.name, email: u.email })));

  if (users.length === 0) {
    console.log('No users found');
    return;
  }

  const user = users[0];

  // Check existing field visits
  const existingVisits = await prisma.fieldVisit.findMany({ where: { organizationId: org.id } });
  console.log('Existing visits:', existingVisits.length);
  existingVisits.forEach(v => console.log('  -', v.title, v.purpose, v.latitude, v.longitude, v.status, v.companyId));

  // Delete existing visits first to avoid duplicates
  await prisma.fieldVisit.deleteMany({ where: { organizationId: org.id } });
  console.log('Deleted existing visits');

  // Create some sample field visits with coordinates (Mumbai area)
  const today = new Date();
  today.setHours(9, 0, 0, 0);

  const visits = [
    {
      title: 'Client Meeting - Acme Corp',
      purpose: 'Discuss Q4 roadmap and contract renewal',
      address: 'Bandra Kurla Complex, Mumbai',
      latitude: 19.0670,
      longitude: 72.8655,
      scheduledAt: new Date(today.getTime() + 2 * 60 * 60 * 1000),
      status: 'SCHEDULED' as const,
      assigneeId: user.id,
      organizationId: org.id,
    },
    {
      title: 'Follow-up - TechStart Inc',
      purpose: 'Technical demo and pricing discussion',
      address: 'Andheri East, Mumbai',
      latitude: 19.1136,
      longitude: 72.8697,
      scheduledAt: new Date(today.getTime() + 4 * 60 * 60 * 1000),
      status: 'ON_THE_WAY' as const,
      assigneeId: user.id,
      organizationId: org.id,
    },
    {
      title: 'Product Demo - GlobalTech',
      purpose: 'Live product demonstration for stakeholders',
      address: 'Lower Parel, Mumbai',
      latitude: 19.0000,
      longitude: 72.8280,
      scheduledAt: new Date(today.getTime() + 6 * 60 * 60 * 1000),
      status: 'CHECKED_IN' as const,
      assigneeId: user.id,
      organizationId: org.id,
    },
    {
      title: 'Quarterly Review - MegaCorp',
      purpose: 'Quarterly business review and planning',
      address: 'Powai, Mumbai',
      latitude: 19.1176,
      longitude: 72.9060,
      scheduledAt: new Date(today.getTime() - 1 * 60 * 60 * 1000),
      status: 'IN_MEETING' as const,
      assigneeId: user.id,
      organizationId: org.id,
    },
    {
      title: 'Site Visit - StartupHub',
      purpose: 'Facility tour and partnership discussion',
      address: 'Navi Mumbai',
      latitude: 19.0330,
      longitude: 73.0297,
      scheduledAt: new Date(today.getTime() + 8 * 60 * 60 * 1000),
      status: 'SCHEDULED' as const,
      assigneeId: user.id,
      organizationId: org.id,
    },
  ];

  for (const visit of visits) {
    const created = await prisma.fieldVisit.create({ data: visit });
    console.log('Created visit:', created.title, created.latitude, created.longitude, created.status);
  }

  console.log('Done seeding field visits!');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
