import { Context, HonoRequest, MiddlewareHandler } from "hono"
import { getConnInfo } from "hono/deno"
import { HTTPException } from "hono/http-exception"
import { cyan, green, red, yellow } from "jsr:@std/fmt@^1.0.8/colors"
import { freemem, loadavg, totalmem } from "node:os"
import { memoryUsage } from "node:process"

const X_RESPONSE_TIME = "X-Response-Time"

const getColorForHttpStatus = (status: number) => {
  if (status >= 500) {
    return red
  }
  if (status >= 400) {
    return yellow
  }
  if (status >= 300) {
    return cyan
  }
  if (status >= 200) {
    return green
  }
  return red
}

const honoRemoteAddressSymbol = Symbol()

export const honoSetRemoteAddress = (behindReverseProxy = false): MiddlewareHandler => {
  if (behindReverseProxy) {
    return async (ctx, next) => {
      const cache = ctx.req as Record<symbol, any>
      cache[honoRemoteAddressSymbol] = () => ctx.req.header("X-Forwarded-For")?.split(",")[0]
      await next()
    }
  } else {
    return async (ctx, next) => {
      const cache = ctx.req as Record<symbol, any>
      cache[honoRemoteAddressSymbol] = () => getConnInfo(ctx).remote.address
      await next()
    }
  }
}

export const honoRemoteAddress = (request: HonoRequest): string | undefined => {
  const cache = request as Record<symbol, any>
  return cache[honoRemoteAddressSymbol]()
}

export const honoResponseTime = (): MiddlewareHandler => {
  return async (ctx, next) => {
    const start = Date.now()
    try {
      await next()
    } finally {
      const ms = Date.now() - start
      ctx.res.headers.set(X_RESPONSE_TIME, `${ms}ms`)
    }
  }
}

export const honoLogger = (): MiddlewareHandler => {
  const makeLogString = (ctx: Context, msg: string, date = new Date()) => {
    return `[${date.toISOString()} http] ${honoRemoteAddress(ctx.req)} "${ctx.req.method} ${ctx.req.path}" ${msg}`
  }

  return async (ctx, next) => {
    let status = undefined as number | undefined
    try {
      await next()
    } catch (error: any) {
      status = error.status ?? undefined
      throw error
    } finally {
      status = status ?? ctx.res.status ?? 500

      const responseTime = ctx.res.headers.get(X_RESPONSE_TIME)

      const logString = makeLogString(ctx, `${getColorForHttpStatus(status)(String(status)) } ${responseTime}`)
      console.log(logString)
    }
  }
}

type LoadInfo = {
  count: number
  msSpent: number
  load: number
  memoryFree: number
  memoryUsage: number
}

const requestsThisDay = new Map<number, Map<number, LoadInfo>>()
if (Deno.cron) {
  Deno.cron("requestsThisDay-clear", "0 0 * * *", () => {
    requestsThisDay.clear()
  })
}

const addLoadInfo = (start: Date) => {
  const msSpent = Date.now() - start.getTime()
  const load = loadavg()[0] ?? 0
  const memoryFree = freemem() / 1024 / 1024 / 1024
  const _memoryUsage = memoryUsage.rss() / 1024 / 1024 / 1024

  const hour = start.getUTCHours()
  const minute = start.getUTCMinutes()

  const requestsThisHour = requestsThisDay.get(hour) ?? new Map<number, LoadInfo>()
  requestsThisDay.set(hour, requestsThisHour)

  const requestsThisMinute = requestsThisHour.get(minute) ?? { count: 0, msSpent: 0, load: 0, memoryFree: 0, memoryUsage: 0 }
  requestsThisHour.set(minute, {
    count: requestsThisMinute.count + 1,
    msSpent: requestsThisMinute.msSpent + msSpent,
    load: requestsThisMinute.load + load,
    memoryFree: requestsThisMinute.memoryFree + memoryFree,
    memoryUsage: requestsThisMinute.memoryUsage + _memoryUsage,
  })
}

export const honoLoadCounter = (): MiddlewareHandler => {
  return async (ctx, next) => {
    const start = new Date()
    try {
      await next()
    } finally {
      addLoadInfo(start)
    }
  }
}

const serverStartDate = new Date()
const serverStartYear = serverStartDate.getUTCFullYear()
const serverStartMonth = serverStartDate.getUTCMonth()
const serverStartDay = serverStartDate.getUTCDate()
const serverStartHour = serverStartDate.getUTCHours()
const serverStartMinute = serverStartDate.getUTCMinutes()

type AverageLoadInfo = {
  timestamp: string
  requestsPerMinute: number
  averageResponseTimeInMs: number
  averageSystemLoad: number
  totalMemoryInGB: number
  averageFreeMemoryInGB: number
  averageUsedMemoryInGB: number
}

export const getHonoServerLoad = (): AverageLoadInfo[] => {
  const result = [] as AverageLoadInfo[]

  const currentDate = new Date()
  const currentYear = currentDate.getUTCFullYear()
  const currentMonth = currentDate.getUTCMonth()
  const currentDay = currentDate.getUTCDate()
  const currentHour = currentDate.getUTCHours()
  const currentMinute = currentDate.getUTCMinutes()

  const serverStartedToday = (currentYear === serverStartYear && currentMonth === serverStartMonth && currentDay === serverStartDay)

  for (let hour = 0; hour < 24; hour++) {
    let minutes = 0
    let requests = 0
    let responseTimeInMs = 0
    let systemLoad = 0
    let freeMemory = 0
    let usedMemory = 0

    const requestsThisHour = requestsThisDay.get(hour)
    if (requestsThisHour) {
      for (let minute = 0; minute < 60; minute++) {
        if (serverStartedToday) {
          if (hour <= serverStartHour && minute < serverStartMinute) {
            continue
          }
        }
        if (hour >= currentHour && minute > currentMinute) {
          break
        }

        const requestsThisMinute = requestsThisHour.get(minute)
        if (requestsThisMinute) {
          const { count, msSpent, load, memoryFree, memoryUsage } = requestsThisMinute

          requests += count
          responseTimeInMs += msSpent
          systemLoad += load
          freeMemory += memoryFree
          usedMemory += memoryUsage
        }

        minutes += 1
      }
    }

    const timestamp = new Date()
    timestamp.setUTCHours(hour)
    timestamp.setUTCMinutes(0)
    timestamp.setUTCSeconds(0)
    timestamp.setUTCMilliseconds(0)

    const totalMemoryInGB = totalmem() / 1024 / 1024 / 1024

    result.push({
      timestamp: timestamp.toISOString(),
      requestsPerMinute: (requests / Math.max(minutes, 1)),
      averageResponseTimeInMs: (responseTimeInMs / Math.max(requests, 1)),
      averageSystemLoad: (systemLoad / Math.max(requests, 1)) / navigator.hardwareConcurrency,
      totalMemoryInGB,
      averageFreeMemoryInGB: (freeMemory / Math.max(requests, 1)),
      averageUsedMemoryInGB: (usedMemory / Math.max(requests, 1)),
    })
  }

  return result
}

export const getCurrentHonoServerLoad = (isRetry = false): AverageLoadInfo => {
  const load = getHonoServerLoad()
  const currentLoad = load.find(l => new Date(l.timestamp).getUTCHours() === new Date().getUTCHours())
  if (!currentLoad) {
    throw new Error()
  }
  if (isRetry) {
    return currentLoad
  }
  if (currentLoad.averageSystemLoad === 0) {
    addLoadInfo(new Date())
    return getCurrentHonoServerLoad(true)
  }
  return currentLoad
}

export const logHonoDebugInfo = () => {
  const load = getCurrentHonoServerLoad()
  const loadavg = (Deno.loadavg()[0] ?? 0) / navigator.hardwareConcurrency
  const memoryFree = Deno.systemMemoryInfo().available / 1024 / 1024 / 1024
  const memoryUsage = Deno.memoryUsage().rss / 1024 / 1024 / 1024

  console.log(`[${new Date().toISOString()} dbg] freeMem:${memoryFree.toFixed(2)}GB usedMem:${memoryUsage.toFixed(2)}GB rpm:${load.requestsPerMinute.toFixed(2)} avg:${load.averageResponseTimeInMs.toFixed(0)}ms load:${loadavg.toFixed(2)}`)
}

export const honoRateLimiter = (opts: { window: number, rate: number, burst: number }): MiddlewareHandler => {
  const counts = new Map<string, number>()
  let start = Date.now()

  return async (ctx, next) => {
    const now = Date.now()
    if (now > (start + opts.window)) {
      start = now
      counts.clear()
    }

    const seconds = (now - start) / 1000

    const count = counts.get(ctx.get("IP")) ?? 0
    if (count > opts.burst && (count / seconds) > opts.rate) {
      throw new HTTPException(429)
    }

    counts.set(ctx.get("IP"), count + 1)

    await next()
  }
}
