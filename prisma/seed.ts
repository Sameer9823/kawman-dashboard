/**
 * Seeds a fresh Neon database with one demo organization so the app is
 * immediately usable after `npm run db:seed`. Safe to re-run: it exits
 * early if the demo org already exists.
 *
 * Run with:  npm run db:seed
 */
import { prisma } from '../src/lib/db'
import { ensureRolesAndPermissionsSeeded } from '../src/lib/rbac-seed'
import { hashPassword } from 'better-auth/crypto'

const DEMO_PASSWORD = 'Password123!'
const ORG_SLUG = 'kawman-exact-demo'

async function main() {
  const existing = await prisma.organization.findUnique({ where: { slug: ORG_SLUG } })
  if (existing) {
    console.log(`Organization "${existing.name}" already seeded (slug: ${ORG_SLUG}). Skipping.`)
    console.log('Delete it first (or change ORG_SLUG in prisma/seed.ts) to reseed.')
    return
  }

  console.log('Seeding Permission/Role catalog...')
  await ensureRolesAndPermissionsSeeded()

  console.log('Creating organization...')
  const org = await prisma.organization.create({
    data: {
      name: 'Kawman ExAct Ingredients Pvt. Ltd.',
      slug: ORG_SLUG,
      industry: 'Nutraceuticals & Specialty Ingredients',
      phone: '+91 22 4012 5000',
      email: 'hello@kawmanexact.com',
      website: 'https://kawmanexact.com',
    },
  })

  const department = await prisma.department.create({
    data: { name: 'Sales', organizationId: org.id },
  })
  const team = await prisma.team.create({
    data: { name: 'Field Sales - West', organizationId: org.id, departmentId: department.id },
  })

  console.log('Creating users...')
  const passwordHash = await hashPassword(DEMO_PASSWORD)

  async function createUser(input: {
    name: string
    email: string
    role: string
    designation: string
  }) {
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        organizationId: org.id,
        departmentId: department.id,
        teamId: team.id,
        designation: input.designation,
        emailVerified: true,
        status: 'ACTIVE',
      },
    })
    await prisma.account.create({
      data: {
        userId: user.id,
        accountId: user.id,
        providerId: 'credential',
        password: passwordHash,
      },
    })
    const role = await prisma.role.findUniqueOrThrow({ where: { name: input.role as never } })
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } })
    return user
  }

  const admin = await createUser({
    name: 'Priya Sharma',
    email: 'admin@kawmanexact.com',
    role: 'SUPER_ADMIN',
    designation: 'Founder & CEO',
  })
  const salesManager = await createUser({
    name: 'Arjun Mehta',
    email: 'manager@kawmanexact.com',
    role: 'SALES_MANAGER',
    designation: 'Sales Manager',
  })
  const exec1 = await createUser({
    name: 'Rahul Sharma',
    email: 'rahul@kawmanexact.com',
    role: 'SALES_EXECUTIVE',
    designation: 'Field Sales Executive',
  })
  const exec2 = await createUser({
    name: 'Sneha Kulkarni',
    email: 'sneha@kawmanexact.com',
    role: 'SALES_EXECUTIVE',
    designation: 'Field Sales Executive',
  })

  await prisma.team.update({ where: { id: team.id }, data: { managerId: salesManager.id } })

  console.log('Creating companies + contacts...')
  const companySeed = [
    { name: 'Wellness Labs Pvt. Ltd.', industry: 'Nutraceuticals', city: 'Mumbai', state: 'Maharashtra', employees: 240, revenue: 85_00_00_000 },
    { name: 'VitaCore Biosciences', industry: 'Pharmaceuticals', city: 'Pune', state: 'Maharashtra', employees: 180, revenue: 42_00_00_000 },
    { name: 'GreenLeaf Nutraceuticals', industry: 'Nutraceuticals', city: 'Ahmedabad', state: 'Gujarat', employees: 95, revenue: 18_00_00_000 },
    { name: 'PureSource Ingredients', industry: 'Food Ingredients', city: 'Bengaluru', state: 'Karnataka', employees: 310, revenue: 120_00_00_000 },
    { name: 'NutriEdge Formulations', industry: 'Nutraceuticals', city: 'Delhi', state: 'Delhi', employees: 60, revenue: 9_50_00_000 },
    { name: 'BioActive Compounds Co.', industry: 'Specialty Chemicals', city: 'Hyderabad', state: 'Telangana', employees: 150, revenue: 33_00_00_000 },
  ]

  const owners = [admin, salesManager, exec1, exec2]
  const companies = []
  for (let i = 0; i < companySeed.length; i++) {
    const c = companySeed[i]
    const company = await prisma.company.create({
      data: {
        ...c,
        organizationId: org.id,
        ownerId: owners[i % owners.length].id,
      },
    })
    companies.push(company)

    await prisma.contact.create({
      data: {
        name: ['Anjali Mehta', 'Vikram Rao', 'Kavita Nair', 'Suresh Iyer', 'Neha Joshi', 'Amit Desai'][i],
        designation: ['Procurement Head', 'R&D Director', 'CEO', 'Purchase Manager', 'VP Operations', 'Quality Head'][i],
        email: `contact${i + 1}@${company.name.toLowerCase().replace(/[^a-z]+/g, '')}.com`,
        phone: `+91 22 4${100 + i}0 00${i}0`,
        mobile: `+91 98${100 + i}0 0000${i}`,
        companyId: company.id,
        organizationId: org.id,
        ownerId: owners[i % owners.length].id,
        lastActivityAt: new Date(Date.now() - i * 86_400_000),
      },
    })
  }

  console.log('Creating leads...')
  const leadSources = ['Website', 'Referral', 'Trade Show', 'Cold Call', 'Email Campaign', 'Social Media']
  const leadStatuses = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'] as const
  const leadNames = [
    'Rohan Kapoor', 'Divya Reddy', 'Manish Agarwal', 'Pooja Bansal', 'Karan Malhotra',
    'Ritu Chawla', 'Sanjay Verma', 'Ananya Ghosh', 'Vivek Pillai', 'Meera Krishnan',
  ]
  for (let i = 0; i < leadNames.length; i++) {
    const owner = owners[i % owners.length]
    const company = companies[i % companies.length]
    const status = leadStatuses[i % leadStatuses.length]
    const lead = await prisma.lead.create({
      data: {
        name: leadNames[i],
        company: company.name,
        companyId: Math.random() > 0.4 ? company.id : null,
        email: `${leadNames[i].toLowerCase().replace(' ', '.')}@example.com`,
        phone: `+91 90${100 + i}0 0000${i}`,
        source: leadSources[i % leadSources.length],
        status,
        score: 40 + ((i * 13) % 60),
        value: 2_00_000 + i * 75_000,
        organizationId: org.id,
        ownerId: owner.id,
        createdAt: new Date(Date.now() - (i % 12) * 86_400_000),
        lastActivityAt: new Date(Date.now() - (i % 5) * 86_400_000),
      },
    })
    await prisma.activity.create({
      data: {
        type: 'LEAD_CREATED',
        description: `${owner.name} created lead "${lead.name}"`,
        organizationId: org.id,
        actorId: owner.id,
        leadId: lead.id,
        createdAt: lead.createdAt,
      },
    })
  }

  console.log('Creating deals...')
  const dealStages = ['NEW_LEAD', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'] as const
  const dealNames = [
    'AlphaExAct™ Bulk Supply Q3', 'OmniBoost Capsule Formulation', 'PureWhey Isolate Contract',
    'NutriBlend Custom Mix', 'VitaCore Annual Supply', 'GreenLeaf Trial Order',
    'BioActive R&D Partnership', 'PureSource Expansion Deal',
  ]
  for (let i = 0; i < dealNames.length; i++) {
    const owner = owners[i % owners.length]
    const company = companies[i % companies.length]
    const stage = dealStages[i % dealStages.length]
    const isClosed = stage === 'WON' || stage === 'LOST'
    const deal = await prisma.deal.create({
      data: {
        name: dealNames[i],
        value: 5_00_000 + i * 3_25_000,
        probability: stage === 'WON' ? 100 : stage === 'LOST' ? 0 : 20 + i * 10,
        stage,
        priority: i % 3 === 0 ? 'HIGH' : i % 3 === 1 ? 'MEDIUM' : 'LOW',
        expectedClose: new Date(Date.now() + (14 - i) * 86_400_000),
        companyId: company.id,
        organizationId: org.id,
        ownerId: owner.id,
        createdAt: new Date(Date.now() - (i + 2) * 86_400_000),
        closedAt: isClosed ? new Date(Date.now() - i * 86_400_000) : null,
      },
    })
    await prisma.activity.create({
      data: {
        type: stage === 'WON' ? 'DEAL_WON' : 'DEAL_UPDATED',
        description: `${owner.name} ${stage === 'WON' ? 'won' : 'updated'} deal "${deal.name}"`,
        organizationId: org.id,
        actorId: owner.id,
        dealId: deal.id,
        companyId: company.id,
        createdAt: deal.createdAt,
      },
    })
  }

  console.log('Creating follow-ups...')
  const followUpTitles = ['Send proposal', 'Schedule demo call', 'Follow up on pricing', 'Confirm PO details', 'Share samples']
  for (let i = 0; i < followUpTitles.length; i++) {
    const owner = owners[i % owners.length]
    const company = companies[i % companies.length]
    await prisma.followUp.create({
      data: {
        title: followUpTitles[i],
        dueDate: new Date(Date.now() + (i - 1) * 3_600_000 * (i % 2 === 0 ? 1 : 24)),
        status: 'PENDING',
        organizationId: org.id,
        ownerId: owner.id,
        companyId: company.id,
      },
    })
  }

  console.log('Creating today\'s field visits + check-ins...')
  // Roughly Mumbai-area coordinates, spread out so the live-map card has something to plot.
  const visitCoords = [
    { lat: 19.076, lng: 72.8777 },
    { lat: 19.099, lng: 72.9081 },
    { lat: 19.017, lng: 72.8311 },
  ]
  const visitStatuses = ['CHECKED_IN', 'IN_MEETING', 'ON_THE_WAY'] as const
  for (let i = 0; i < visitCoords.length; i++) {
    const assignee = [exec1, exec2, salesManager][i % 3]
    const company = companies[i % companies.length]
    const visit = await prisma.fieldVisit.create({
      data: {
        title: `Visit — ${company.name}`,
        purpose: 'Product demo & requirements discussion',
        scheduledAt: new Date(),
        status: visitStatuses[i],
        latitude: visitCoords[i].lat,
        longitude: visitCoords[i].lng,
        organizationId: org.id,
        assigneeId: assignee.id,
        companyId: company.id,
      },
    })
    if (visitStatuses[i] !== 'ON_THE_WAY') {
      await prisma.checkIn.create({
        data: {
          visitId: visit.id,
          userId: assignee.id,
          latitude: visitCoords[i].lat,
          longitude: visitCoords[i].lng,
          verificationStatus: 'VERIFIED',
        },
      })
    }
  }

  console.log('Creating a completed meeting + AI summary...')
  const meetingCompany = companies[0]
  const meeting = await prisma.meeting.create({
    data: {
      title: `Q3 review — ${meetingCompany.name}`,
      type: 'VIDEO_CALL',
      status: 'COMPLETED',
      scheduledAt: new Date(Date.now() - 3_600_000),
      duration: 45,
      organizationId: org.id,
      createdById: salesManager.id,
      companyId: meetingCompany.id,
      startedAt: new Date(Date.now() - 3_600_000),
      endedAt: new Date(Date.now() - 900_000),
    },
  })
  await prisma.meetingSummary.create({
    data: {
      meetingId: meeting.id,
      summary: `Discussed Q3 supply targets with ${meetingCompany.name}. Positive signals on renewing the annual contract; pricing to be finalized next week.`,
      discussionPoints: ['Q3 volume forecast', 'New product line interest', 'Pricing renegotiation'],
      actionItems: ['Send updated pricing sheet', 'Schedule sample shipment'],
      nextSteps: ['Follow up in 5 business days'],
    },
  })

  console.log('\nDone!\n')
  console.log('Log in with any of these accounts (all use the same password):\n')
  console.log(`  Password: ${DEMO_PASSWORD}\n`)
  console.log(`  ${admin.email}   (Super Admin)`)
  console.log(`  ${salesManager.email} (Sales Manager)`)
  console.log(`  ${exec1.email}   (Sales Executive)`)
  console.log(`  ${exec2.email}   (Sales Executive)`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
