import { argon2id, argon2Verify } from "npm:hash-wasm@^4.12.0"

export class Argon2 {
  static hash(password: string) {
    return argon2id({
      outputType: "encoded",
      password,
      salt: crypto.getRandomValues(new Uint8Array(16)),
      iterations: 10,
      memorySize: 1024 * 64,
      hashLength: 32,
      parallelism: 1,
    })
  }

  static verify(password: string, hash: string) {
    return argon2Verify({
      password,
      hash,
    })
  }
}
