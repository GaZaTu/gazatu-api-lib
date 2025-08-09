import { argon2id, argon2Verify } from "npm:hash-wasm@^4.12.0"

export const argon2HashPassword = (password: string) => {
  return argon2id({
    outputType: "encoded",
    password,
    salt: crypto.getRandomValues(new Uint8Array(16)),
    iterations: 8,
    memorySize: 1024 * 32, // = 32 MB
    hashLength: 32, // bytes
    parallelism: 1,
  })
}

export const argon2VerifyPassword = (password: string, hash: string) => {
  return argon2Verify({
    password,
    hash,
  })
}
