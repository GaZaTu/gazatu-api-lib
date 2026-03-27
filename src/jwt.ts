import * as jwt from "jsr:@zaubrik/djwt@^3.0.2"
import { existsSync } from "node:fs"
import { dirname } from "node:path"
import { appdataDir } from "./appinfo.ts"

const generateCachedCryptoKey = async (keyPath: string, algorithm: AesKeyGenParams | HmacKeyGenParams, extractable: boolean, keyUsages: KeyUsage[]): Promise<CryptoKey> => {
  const keySettings = [algorithm, extractable, keyUsages] as const
  const keyFormat = "jwk"

  if (existsSync(keyPath)) {
    const keyAsString = await Deno.readTextFile(keyPath)
    const keyAsJWK = JSON.parse(keyAsString) as JsonWebKey

    const key = await crypto.subtle.importKey(keyFormat, keyAsJWK, ...keySettings)
    return key
  } else {
    const key = await crypto.subtle.generateKey(...keySettings) as CryptoKey

    const keyAsJWK = await crypto.subtle.exportKey(keyFormat, key)
    await Deno.mkdir(dirname(keyPath), { recursive: true })
    await Deno.writeTextFile(keyPath, JSON.stringify(keyAsJWK))

    return key
  }
}

const SIGNING_KEY = await generateCachedCryptoKey(`${appdataDir}/jwt-key.jwk`, { name: "HMAC", hash: "SHA-512" }, true, ["sign", "verify"])

export class JWT {
  static async create<P extends Record<string, any>>(data: P) {
    const token = await jwt.create({ alg: "HS512" }, data, SIGNING_KEY)
    return token
  }

  static async verify<P extends Record<string, any>>(token: string) {
    const payload = await jwt.verify(token, SIGNING_KEY, {})
    return payload as P
  }
}
