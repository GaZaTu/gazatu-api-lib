import * as jwt from "jsr:@zaubrik/djwt@^3.0.2"
import { existsSync } from "node:fs"
import { dirname } from "node:path"
import { appdataDir } from "./appinfo.ts"

export async function lazyCryptoKey(keyPath: string, algorithm: RsaHashedKeyGenParams | EcKeyGenParams, extractable: boolean, keyUsages: KeyUsage[]): Promise<CryptoKeyPair>
export async function lazyCryptoKey(keyPath: string, algorithm: AesKeyGenParams | HmacKeyGenParams, extractable: boolean, keyUsages: KeyUsage[]): Promise<CryptoKey>
export async function lazyCryptoKey(keyPath: string, algorithm: AlgorithmIdentifier, extractable: boolean, keyUsages: KeyUsage[]): Promise<CryptoKeyPair | CryptoKey> {
  type StoredJsonWebKey = {
    type: "single"
    key: JsonWebKey
  } | {
    type: "private-public"
    privateKey: JsonWebKey
    publicKey: JsonWebKey
  }

  if (existsSync(keyPath)) {
    const json = await Deno.readTextFile(keyPath)
    const jwk = JSON.parse(json) as StoredJsonWebKey

    if (jwk.type === "single") {
      const key = await crypto.subtle.importKey("jwk", jwk.key, algorithm, extractable, keyUsages)
      return key
    } else {
      return {
        privateKey: await crypto.subtle.importKey("jwk", jwk.privateKey, algorithm, extractable, jwk.privateKey.key_ops as any),
        publicKey: await crypto.subtle.importKey("jwk", jwk.publicKey, algorithm, extractable, jwk.publicKey.key_ops as any),
      }
    }
  } else {
    const key = await crypto.subtle.generateKey(algorithm, extractable, keyUsages)

    let jwk: StoredJsonWebKey
    if (key instanceof CryptoKey) {
      jwk = {
        type: "single",
        key: await crypto.subtle.exportKey("jwk", key),
      }
    } else {
      jwk = {
        type: "private-public",
        privateKey: await crypto.subtle.exportKey("jwk", key.privateKey),
        publicKey: await crypto.subtle.exportKey("jwk", key.publicKey),
      }
    }

    await Deno.mkdir(dirname(keyPath), { recursive: true })
    await Deno.writeTextFile(keyPath, JSON.stringify(jwk))

    return key
  }
}

const SIGNING_KEY = await lazyCryptoKey(`${appdataDir}/jwt-key.jwk`, { name: "HMAC", hash: "SHA-512" }, true, ["sign", "verify"])

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
