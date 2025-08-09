import { Request, Status, createHttpError } from "@oak/oak"
import { JWT } from "./jwt.ts"

const currentUserSymbol = Symbol()
const currentUserFailedSymbol = Symbol()

interface IUserRole {
  name: string
}

interface IUser<UserRole extends IUserRole = IUserRole> {
  id: any
  roles: UserRole[]
}

interface IUserInput {
  id?: any
  roles?: IUserRole[]
}

export class AuthorizationHelper<User extends IUser> {
  public readonly knownUsers = new Map<string, User>()

  constructor(
    public readonly findUser: (userId: any) => Promise<User | undefined>,
  ) { }

  async findUserByRequest(request: Request | undefined) {
    if (!request) {
      return undefined
    }

    const cache = request as Record<string | symbol, any>

    if (cache[currentUserFailedSymbol]) {
      return undefined
    }

    const existing = cache[currentUserSymbol] as User | undefined
    if (existing) {
      return existing
    }

    const authHeader = request.headers.get("Authorization")
    if (!authHeader) {
      cache[currentUserFailedSymbol] = true
      return undefined
    }

    const known = this.knownUsers.get(authHeader)
    if (known) {
      return known
    }

    const auth = await (async () => {
      const authToken = authHeader.replace("Bearer", "").trim()

      try {
        return await JWT.verify<{ userId: string }>(authToken)
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

    this.knownUsers.set(authHeader, cache[currentUserSymbol] = user)

    const result = cache[currentUserSymbol] as User
    return result
  }

  async hasAuth(user: IUserInput | Request | undefined, neededRoles: string[] = []) {
    if (!user) {
      return true
    }

    if (user instanceof Request) {
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

  async assertAuth(user: IUserInput | Request | undefined, neededRoles?: string[]) {
    if (!await this.hasAuth(user, neededRoles)) {
      if (neededRoles?.length) {
        throw createHttpError(Status.Forbidden, `Required user roles: ${neededRoles?.join(", ")}.`)
      } else {
        throw createHttpError(Status.Unauthorized, "You need to be logged in to access this resource.")
      }
    }
  }
}
