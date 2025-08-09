import { createHttpError, Status, type Context, type Middleware } from "@oak/oak"
import { cyan, green, red, yellow } from "jsr:@std/fmt@^1.0.8/colors"

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

export const oakLogger = (mode: "simple" | "full" = "simple"): Middleware => {
  const fullLogging = mode === "full"

  const makeLogString = (ctx: Context, msg: string, date = new Date()) => {
    const { ip, method, url } = ctx.request
    return `[${date.toISOString()} oak] ${ip} "${method} ${url.pathname}" ${msg}`
  }

  return async (ctx, next) => {
    ctx.state._log ??= []

    const start = new Date()

    if (fullLogging) {
      console.log(makeLogString(ctx, "begin", start))
    }

    let status = undefined as number | undefined
    try {
      await next()
    } catch (error: any) {
      status = error.status ?? undefined
      throw error
    } finally {
      status = status ?? ctx.response.status

      const responseTime = ctx.response.headers.get(X_RESPONSE_TIME)

      let logString = makeLogString(ctx, `${status} ${responseTime}`, fullLogging ? start : undefined)
      if (fullLogging) {
        logString = getColorForHttpStatus(status)(logString)
      }

      console.group(logString)
      for (const detail of ctx.state._log) {
        console.log(detail)
      }
      console.groupEnd()
    }
  }
}

export const oakResponseTime = (): Middleware => {
  return async (ctx, next) => {
    const start = Date.now()
    try {
      await next()
    } finally {
      const ms = Date.now() - start
      ctx.response.headers.set(X_RESPONSE_TIME, `${ms}ms`)
    }
  }
}

export const oakJsonError = (options?: { pretty?: boolean, stacktrace?: boolean }): Middleware => {
  return async (ctx, next) => {
    try {
      await next()

      if (!ctx.response.status || (ctx.response.status === Status.NotFound && !ctx.response.body)) {
        ctx.throw(Status.NotFound)
      }
    } catch (error: any) {
      ctx.response.status = error.status ?? Status.InternalServerError
      ctx.response.type = "application/json"
      ctx.response.body = JSON.stringify({
        errors: [{
          name: error.name,
          message: error.message,
          status: error.status,
          stack: options?.stacktrace ? error.stack : undefined,
        }],
      }, undefined, options?.pretty ? "  " : undefined)

      // if (ctx.response.status === Status.InternalServerError) {
      //   console.error(error)
      // }
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
  const load = Deno.loadavg()[0] ?? 0
  const memoryFree = Deno.systemMemoryInfo().available / 1024 / 1024 / 1024
  const memoryUsage = Deno.memoryUsage().rss / 1024 / 1024 / 1024

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
    memoryUsage: requestsThisMinute.memoryUsage + memoryUsage,
  })
}

export const oakLoadCounter = (): Middleware => {
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

export const getOakServerLoad = (): AverageLoadInfo[] => {
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

    const totalMemoryInGB = Deno.systemMemoryInfo().total / 1024 / 1024 / 1024

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

export const getCurrentOakServerLoad = (isRetry = false): AverageLoadInfo => {
  const load = getOakServerLoad()
  const currentLoad = load.find(l => new Date(l.timestamp).getUTCHours() === new Date().getUTCHours())
  if (!currentLoad) {
    throw new Error()
  }
  if (isRetry) {
    return currentLoad
  }
  if (currentLoad.averageSystemLoad === 0) {
    addLoadInfo(new Date())
    return getCurrentOakServerLoad(true)
  }
  return currentLoad
}

export const oakRateLimiter = (opts: { window: number, rate: number, burst: number }): Middleware => {
  const counts = new Map<string, number>()
  let start = Date.now()

  return async (ctx, next) => {
    const now = Date.now()
    if (now > (start + opts.window)) {
      start = now
      counts.clear()
    }

    const seconds = (now - start) / 1000

    const count = counts.get(ctx.request.ip) ?? 0
    if (count > opts.burst && (count / seconds) > opts.rate) {
      throw createHttpError(Status.TooManyRequests)
    }

    counts.set(ctx.request.ip, count + 1)

    await next()
  }
}
