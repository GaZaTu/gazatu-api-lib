import * as jsonc from "jsr:@std/jsonc@^1.0.2"
import { dirname, normalize, resolve } from "node:path"

if (Deno.build.standalone) {
  Deno.env.set("DENO_STANDALONE", "1")
}

if (Deno.mainModule) {
  Deno.env.set("DENO_MAINMODULE", Deno.mainModule)
}

export const appDir = (() => {
  if (Deno.env.get("DENO_STANDALONE") === "1") {
    return normalize(dirname(Deno.execPath()))
  } else {
    let mainDirectory = dirname(new URL(Deno.env.get("DENO_MAINMODULE")!).pathname)
    if (mainDirectory.endsWith("src")) {
      mainDirectory = resolve(mainDirectory, "..")
    }
    return normalize(mainDirectory)
  }
})()

Deno.env.set("APP", appDir)

export const appdataDir = Deno.env.get("APPDATA_OVERRIDE") ?? resolve(appDir, "data")
await Deno.mkdir(appdataDir, { recursive: true })

Deno.env.set("APPDATA", appdataDir)

export const readConfigFile = <T extends Record<string, any>>(): T => {
  try {
    const configJson = Deno.readTextFileSync(`${appdataDir}/config.jsonc`)
      .replaceAll(/\${(\w+)}/gm, (_, g0) => Deno.env.get(g0) ?? "")
    const config = jsonc.parse(configJson) as Record<string, any>
    return config as any
  } catch {
    return {} as any
  }
}
