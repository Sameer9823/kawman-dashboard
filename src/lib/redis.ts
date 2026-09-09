import 'server-only'
import Redis from 'ioredis'

/**
 * Redis client for shared state across server instances.
 * Used for rate limiting, caching, and other distributed state.
 * 
 * Connection is lazy - only created when first accessed.
 */
let redisClient: Redis | null = null

export function getRedisClient(): Redis | null {
  if (redisClient) return redisClient

  const redisUrl = process.env.REDIS_URL
  if (!redisUrl) {
    console.warn('[REDIS] REDIS_URL not configured - rate limiting will use in-memory fallback')
    return null
  }

  try {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) return null // Stop retrying
        return Math.min(times * 200, 2000)
      },
      lazyConnect: true,
    })

    redisClient.on('error', (err) => {
      console.error('[REDIS] Connection error:', err.message)
    })

    redisClient.on('connect', () => {
      console.log('[REDIS] Connected successfully')
    })

    return redisClient
  } catch (error) {
    console.error('[REDIS] Failed to create client:', error)
    return null
  }
}

export async function closeRedisClient(): Promise<void> {
  if (redisClient) {
    await redisClient.quit()
    redisClient = null
  }
}