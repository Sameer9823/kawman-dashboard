// CRM domain types. Mirror prisma/schema.prisma enums/fields so the
// eventual Prisma query results can be mapped into these shapes with
// minimal translation. See src/services/{lead,company,contact,deal}.service.ts.

export type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'PROPOSAL' | 'NEGOTIATION' | 'WON' | 'LOST'

export interface Lead {
  id: string
  name: string
  company: string
  email: string
  phone: string
  source: string
  owner: string
  ownerInitials: string
  status: LeadStatus
  score: number
  value: number
  createdAt: string
  lastActivityAt: string
}

export interface Company {
  id: string
  name: string
  industry: string
  website: string
  phone: string
  email: string
  city: string
  state: string
  employees: number
  revenue: number
  owner: string
  ownerInitials: string
  status: 'ACTIVE' | 'INACTIVE'
  createdAt: string
}

export interface Contact {
  id: string
  name: string
  company: string
  designation: string
  email: string
  phone: string
  owner: string
  ownerInitials: string
  status: 'ACTIVE' | 'INACTIVE'
  lastActivityAt: string
}

export type DealStage = 'NEW_LEAD' | 'CONTACTED' | 'QUALIFIED' | 'PROPOSAL' | 'NEGOTIATION' | 'WON' | 'LOST'
export type DealPriority = 'LOW' | 'MEDIUM' | 'HIGH'

export interface Deal {
  id: string
  name: string
  company: string
  contact: string
  value: number
  probability: number
  stage: DealStage
  owner: string
  ownerInitials: string
  expectedClose: string
  priority: DealPriority
}
