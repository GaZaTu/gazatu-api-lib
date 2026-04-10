import { Hono, MiddlewareHandler } from "hono"
import { bodyLimit } from "hono/body-limit"
import { compress } from "hono/compress"
import { cors } from "hono/cors"
import { serveStatic } from "hono/deno"
import { HTTPException } from "hono/http-exception"
import { existsSync } from "node:fs"
import { honoLoadCounter, honoLogger, honoSetRemoteAddress, honoResponseTime } from "./hono-helpers.ts"

export type HttpServerConfig = {
  development?: boolean
  host: string
  port: number
  behindProxy?: boolean
  staticDir?: string
  static404File?: string
  staticVolatileFilesMap?: Record<string, boolean>
  sendSecurityHeaders?: boolean
}

export const createHonoApp = (config: HttpServerConfig, middlewares: (Hono | MiddlewareHandler | undefined)[]) => {
  const app = new Hono()

  app.use(honoSetRemoteAddress(config.behindProxy))
  app.use(honoLogger())
  app.use(honoLoadCounter())

  if (config.development) {
    app.use(honoResponseTime())
  }

  app.use(compress())
  app.use(bodyLimit({
    maxSize: 1024 * 256,
    onError: ctx => {
      throw new HTTPException(413)
    },
  }))

  app.use(cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
  }))

  if (config.behindProxy) {
    app.use(async (ctx, next) => {
      ctx.header("Keep-Alive", "timeout=60")

      await next()
    })
  }
  if (config.sendSecurityHeaders) {
    app.use(async (ctx, next) => {
      // form-action 'self';
      ctx.header("Content-Security-Policy", "script-src 'self'; object-src 'none'; frame-ancestors 'self'; base-uri 'self'; worker-src 'self' blob:; trusted-types *;")

      ctx.header("X-Frame-Options", "SAMEORIGIN")
      ctx.header("X-Content-Type-Options", "nosniff")
      ctx.header("X-XSS-Protection", "1; mode=block;")
      ctx.header("Referrer-Policy", "no-referrer")
      ctx.header("Strict-Transport-Security", "max-age=31536000;")

      await next()
    })
  }

  for (const middleware of middlewares) {
    if (!middleware) {
      continue
    }

    if (middleware instanceof Hono) {
      app.route("/", middleware)
    } else {
      app.use(middleware)
    }
  }

  if (config.staticDir && existsSync(config.staticDir)) {
    app.use("/*", serveStatic({
      root: config.staticDir,
      onFound: (path, ctx) => {
        if (!config.staticVolatileFilesMap?.[path]) {
          ctx.header("Cache-Control", "public, immutable, max-age=31536000")
        }
      },
      onNotFound: (path, ctx) => {
        // TODO
      },
    }))
  }

  app.notFound(ctx => {
    return ctx.json({
      errors: [{
        message: "Not Found",
      }],
    }, 404)
  })

  app.onError((err, ctx) => {
    const status = err.status ?? 500
    if (status === 500) {
      console.error(err)
    }

    return ctx.json({
      errors: [{
        name: err.name,
        message: err.message,
        status: err.status,
        stack: config.development ? err.stack : undefined,
      }],
    }, status)
  })

  return app
}

export const listen = (config: HttpServerConfig, middlewares: (Hono | MiddlewareHandler | undefined)[]) => {
  const app = createHonoApp(config, middlewares)

  const url = new URL(`http://${config.host}:${config.port}`)
  const onListen = new Promise(resolve => {
    Deno.serve({
      hostname: config.host,
      port: config.port,
      handler: config.behindProxy ? req => {
        const url = new URL(req.url)
        url.protocol = req.headers.get("X-Forwarded-Proto") ?? url.protocol
        url.host = req.headers.get("X-Forwarded-Host") ?? url.host

        const res = app.fetch(new Request(url, req))
        return res
      } : app.fetch,
      onListen: resolve,
    })
  })

  return Object.assign(app, {
    url,
    onListen,
  })
}
