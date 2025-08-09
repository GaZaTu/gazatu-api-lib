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

export const appdataDir = Deno.env.get("APPDATA_OVERRIDE") ?? resolve(appDir, "data")
await Deno.mkdir(appdataDir, { recursive: true })

const replaceVariablesInConfig = (config: any) => {
  for (const [key, value] of Object.entries(config)) {
    switch (typeof value) {
    case "string":
      config[key] = value
        .replaceAll("$APPDATA", appdataDir)
        .replaceAll("$APP", appDir)
      break
    case "object":
      replaceVariablesInConfig(value ?? {})
      break
    }
  }
}

export const readConfigFile = <T extends Record<string, any>>(): Partial<T> => {
  try {
    const configJson = Deno.readTextFileSync(`${appdataDir}/config.jsonc`)
    const config = jsonc.parse(configJson) as Record<string, any>
    replaceVariablesInConfig(config)
    return config as Partial<T>
  } catch {
    return {}
  }
}
