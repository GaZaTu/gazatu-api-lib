import { HTTPException } from "hono/http-exception"
import { existsSync } from "node:fs"
// @deno-types="npm:@types/web-push"
import webpush from "npm:web-push@^3.6.7"
import { appdataDir } from "./appinfo.ts"

export const WebPushError = webpush.WebPushError

type VapidDetails = Readonly<webpush.VapidKeys> & {
  readonly subject: string
}

interface IPushSubscription {
  readonly data: webpush.PushSubscription
  readonly device?: string
  readonly onError: (error: unknown) => void | Promise<void>
}

interface IPushUser {
  readonly id: any
  readonly pushSubscriptions: IPushSubscription[]
}

export class WebPush<User extends IPushUser> {
  private readonly _vapidDetails: VapidDetails

  constructor(
    private readonly options: {
      subject: string | URL
      keys?: webpush.VapidKeys
      findUser: (userId: any) => Promise<User | undefined>
    },
  ) {
    if (!options.keys) {
      const path = `${appdataDir}/vapid.json`
      if (existsSync(path)) {
        options.keys = JSON.parse(Deno.readTextFileSync(path))
      } else {
        options.keys = webpush.generateVAPIDKeys()
        Deno.writeTextFileSync(path, JSON.stringify(options.keys))
      }
    }

    this._vapidDetails = {
      ...options.keys!,
      subject: String(options.subject),
    }
  }

  async findUser(userId: any): Promise<User | undefined> {
    return await this.options.findUser(userId)
  }

  async sendNotification(subscription: webpush.PushSubscription, payload?: string, options?: webpush.RequestOptions) {
    return await webpush.sendNotification(subscription, payload, {
      ...options,
      vapidDetails: this._vapidDetails,
    })
  }

  async sendUserNotification(user: Partial<IPushUser> | undefined, payload?: string, options?: webpush.RequestOptions) {
    if (!user) {
      return
    }

    if (!user.pushSubscriptions) {
      user = await this.findUser(user.id!)
      if (!user) {
        return
      }
    }

    for (const subscription of (user.pushSubscriptions ?? [])) {
      try {
        const { statusCode } = await this.sendNotification(subscription.data, payload, options)
        if (statusCode !== 200) {
          throw new HTTPException(statusCode as any)
        }
      } catch (error) {
        await subscription.onError(error)
      }
    }
  }

  get publicKey() {
    return this._vapidDetails?.publicKey
  }
}
