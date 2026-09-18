import { PrismaClient } from './src/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const org = await prisma.organization.findFirst();
  if (!org) {
    console.log('No organization found');
    return;
  }
  console.log('Org:', org.name, org.id);
  
  const users = await prisma.user.findMany({ where: { organizationId: org.id } });
  console.log('Users:', users.map(u => ({ id: u.id, name: u.name, email: u.email })));
  
  const visits = await prisma.fieldVisit.findMany({ where: { organizationId: org.id } });
  console.log('Existing visits:', visits.length);
  visits.forEach(v => console.log('  -', v.title, v.status, v.latitude, v.longitude, v.scheduledAt));
}

main().finally(() => prisma.$disconnect());
