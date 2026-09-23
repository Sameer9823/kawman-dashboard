import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRedisClient } from '@/lib/redis'
import { logger } from '@/lib/logger'

interface HealthCheckResult {
  status: 'ok' | 'degraded' | 'error'
  timestamp: string
  uptime: number
  services: {
    database: 'ok' | 'error'
    redis: 'ok' | 'error' | 'disabled'
  }
  checks: {
    database: { latencyMs?: number; error?: string }
    redis: { latencyMs?: number; error?: string }
  }
}

export async function GET() {
  const startedAt = Date.now()
  const result: HealthCheckResult = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Date.now() - (globalThis as unknown as { __appStartedAt?: number }).__appStartedAt!,
    services: {
      database: 'error',
      redis: 'disabled',
    },
    checks: {
      database: {},
      redis: {},
    },
  }

  try {
    const dbStart = Date.now()
    await prisma.$queryRaw`SELECT 1`
    result.checks.database.latencyMs = Date.now() - dbStart
    result.services.database = 'ok'
  } catch (e) {
    result.services.database = 'error'
    result.checks.database.error = e instanceof Error ? e.message : 'Database query failed'
    logger.error('Health check: database failed', { latency: Date.now() - startedAt }, e as Error)
  }

  try {
    const redis = getRedisClient()
    if (redis) {
      const redisStart = Date.now()
      await redis.ping()
      result.checks.redis.latencyMs = Date.now() - redisStart
      result.services.redis = 'ok'
    }
  } catch (e) {
    result.services.redis = 'error'
    result.checks.redis.error = e instanceof Error ? e.message : 'Redis ping failed'
    logger.warn('Health check: redis failed', { error: result.checks.redis.error })
  }

  if (result.services.database === 'error' || result.services.redis === 'error') {
    result.status = 'error'
  } else if (result.services.redis === 'disabled') {
    result.status = 'degraded'
  }

  logger.info('Health check completed', {
    status: result.status,
    latencyMs: Date.now() - startedAt,
  })

  return NextResponse.json(result, {
    status: result.status === 'ok' ? 200 : result.status === 'degraded' ? 200 : 503,
  })
}

const globalWithStart = globalThis as unknown as { __appStartedAt?: number }
if (!globalWithStart.__appStartedAt) {
  globalWithStart.__appStartedAt = Date.now()
}
