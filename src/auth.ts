import { HTTPException } from "hono/http-exception"
import { HonoRequest } from "hono/request"
import { Argon2 } from "./argon2.ts"
import { honoRemoteAddress } from "./hono-helpers.ts"
import { JWT } from "./jwt.ts"

interface UserToken {
  userId: any
}

interface AuthenticationAttempt {
  count: number
  timestamp: number
}

interface IAuthenticationUser {
  readonly id: any
  readonly password: string
  readonly roles: {
    readonly name: string
  }[]
}

export class AuthenticationHelper<User extends IAuthenticationUser> {
  private _attempts = new Map<string, AuthenticationAttempt>()

  constructor(
    public readonly findUser: (userName: string) => Promise<User | undefined>,
  ) { }

  async authenticate(request: HonoRequest, login: { username: string, password: string }) {
    const recentAuthAttempt = this._attempts.get(honoRemoteAddress(request)!)
    if (recentAuthAttempt) {
      const secs = (secs: number) => secs * 1000
      const mins = (mins: number) => secs(mins * 60)

      let waitMs = 0

      if (recentAuthAttempt.count > 12) {
        waitMs = mins(5)
      } else if (recentAuthAttempt.count > 6) {
        waitMs = mins(1)
      } else if (recentAuthAttempt.count > 3) {
        waitMs = secs(5)
      }

      if (recentAuthAttempt.timestamp > (Date.now() - waitMs)) {
        throw new HTTPException(429, {
          message: "Too many failed authentication attempts",
        })
      }

      recentAuthAttempt.count += 1
      recentAuthAttempt.timestamp = Date.now()
    }

    const user = await this.findUser(login.username)
    if (!user) {
      throw new HTTPException(400, {
        message: "authentication failed",
      })
    }

    try {
      const passwordVerified = await Argon2.verify(login.password, user.password)
      if (!passwordVerified) {
        throw new HTTPException(400, {
          message: "authentication failed",
        })
      }

      if (recentAuthAttempt) {
        this._attempts.delete(honoRemoteAddress(request)!)
      }

      const result = await this.createAuthenticationResult(user)
      return result
    } catch {
      // ignore
    }

    if (!recentAuthAttempt) {
      this._attempts.set(honoRemoteAddress(request)!, {
        count: 1,
        timestamp: Date.now(),
      })
    }

    throw new HTTPException(400, {
      message: "authentication failed",
    })
  }

  async createAuthenticationResult(user: User) {
    // deno-lint-ignore no-unused-vars
    const { password, ...userWithoutPassword } = user

    return {
      token: await this.createUserToken(user),
      user: userWithoutPassword,
    }
  }

  async createUserToken(user: Pick<User, "id">) {
    return await JWT.create<UserToken>({ userId: user.id })
  }
}

const currentUserSymbol = Symbol()
const currentUserFailedSymbol = Symbol()

interface IAuthorizationUser {
  readonly id: any
  readonly roles: {
    readonly name: string
  }[]
}

export class AuthorizationHelper<User extends IAuthorizationUser> {
  private readonly _knownUsers = new Map<string, User>()

  constructor(
    public readonly findUser: (userId: any) => Promise<User | undefined>,
  ) { }

  clearCache() {
    this._knownUsers.clear()
  }

  async findUserByRequest(request: HonoRequest | undefined, extractToken = (request: HonoRequest) => request.header("Authorization")) {
    if (!request) {
      return undefined
    }

    const cache = request as Record<symbol, any>

    if (cache[currentUserFailedSymbol]) {
      return undefined
    }

    const existing = cache[currentUserSymbol] as User | undefined
    if (existing) {
      return existing
    }

    const authHeader = extractToken(request)
    if (!authHeader) {
      cache[currentUserFailedSymbol] = true
      return undefined
    }

    const known = this._knownUsers.get(authHeader)
    if (known) {
      return known
    }

    const auth = await (async () => {
      const authToken = authHeader.replace("Bearer", "").trim()

      try {
        return await JWT.verify<UserToken>(authToken)
      } catch {
        return undefined
      }
    })()
    if (!auth) {
      cache[currentUserFailedSymbol] = true
      return undefined
    }

    const user = await this.findUser(auth.userId)
    if (!user) {
      cache[currentUserFailedSymbol] = true
      return undefined
    }

    this._knownUsers.set(authHeader, cache[currentUserSymbol] = user)

    const result = cache[currentUserSymbol] as User
    return result
  }

  async validate(user: Partial<IAuthorizationUser> | HonoRequest | undefined, neededRoles: string[] = []) {
    if (!user) {
      return true
    }

    if (user instanceof HonoRequest) {
      user = await this.findUserByRequest(user)
      if (!user) {
        return false
      }
    }

    if (!user.roles) {
      user = await this.findUser(user.id!)
      if (!user) {
        return false
      }
    }

    const userRoles = user.roles!.map(r => r.name)
    for (const role of neededRoles) {
      if (!userRoles.includes(role)) {
        return false
      }
    }

    return true
  }

  async assert(user: Partial<IAuthorizationUser> | HonoRequest | undefined, neededRoles?: string[]) {
    if (!await this.validate(user, neededRoles)) {
      if (neededRoles?.length) {
        throw new HTTPException(403, {
          message: `Required user roles: ${neededRoles?.join(", ")}.`,
        })
      } else {
        throw new HTTPException(401, {
          message: "You need to be logged in to access this resource.",
        })
      }
    }
  }

  async assertIfCurrentUserIsNotRequestedUser(user: Partial<IAuthorizationUser> | HonoRequest | undefined, neededRoles: string[], requestedUserId: any) {
    const currentUser = await this.findUserByRequest(user)
    if (currentUser?.id !== requestedUserId) {
      await this.assert(user, neededRoles)
    }
  }
}
