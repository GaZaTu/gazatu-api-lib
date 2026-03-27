import { HTTPException } from "hono/http-exception"
import { existsSync } from "node:fs"
// @deno-types="npm:@types/web-push"
import webpush from "npm:web-push@^3.6.7"
import { appdataDir } from "./appinfo.ts"

type VapidDetails = Readonly<webpush.VapidKeys> & {
  readonly subject: string
}

interface IPushSubscription {
  readonly data: webpush.PushSubscription
  readonly device?: "phone" | "pc"
  readonly onError: (error: unknown) => void
}

interface IUser {
  readonly id: any
  readonly pushSubscriptions: IPushSubscription[]
}

export class WebPush<User extends IUser> {
  private _vapidDetails?: VapidDetails

  constructor(
    public readonly findUser: (userId: any) => Promise<User | undefined>,
  ) {}

  /**
   * @param subject This must be either a 'https:' URL or a 'mailto:' address.
   * @param keys
   */
  async initialize(subject: string | URL, keys?: webpush.VapidKeys) {
    if (!keys) {
      const path = `${appdataDir}/vapid.json`
      if (existsSync(path)) {
        keys = JSON.parse(await Deno.readTextFile(path))
      } else {
        keys = webpush.generateVAPIDKeys()
        await Deno.writeTextFile(path, JSON.stringify(keys))
      }
    }

    this._vapidDetails = {
      ...keys!,
      subject: String(subject),
    }
  }

  async sendNotification(subscription: webpush.PushSubscription, payload?: string, options?: webpush.RequestOptions) {
    return await webpush.sendNotification(subscription, payload, {
      ...options,
      vapidDetails: this._vapidDetails,
    })
  }

  async sendUserNotification(user: Partial<IUser> | undefined, payload?: string, options?: webpush.RequestOptions) {
    if (!user) {
      return
    }

    if (!user.pushSubscriptions) {
      user = await this.findUser(user.id!)
      if (!user) {
        return
      }
    }

    for (const subscription of user.pushSubscriptions!) {
      try {
        const { statusCode } = await this.sendNotification(subscription.data, payload, options)
        if (statusCode !== 200) {
          throw new HTTPException(statusCode as any)
        }
      } catch (error) {
        subscription.onError(error)
      }
    }
  }

  get publicKey() {
    return this._vapidDetails?.publicKey
  }
}
