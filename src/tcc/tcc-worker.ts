declare const self: Worker

import type { EmscriptenModule, EmscriptenParams } from "./emscripten.ts"

export type TCCWorkerMessage = {
  arguments?: (string | Uint8Array)[]
  outputPath?: string
  outputIfChanged?: boolean
  sources?: Record<string, Uint8Array | null>
  include?: Record<string, Uint8Array | null>
  library?: Record<string, Uint8Array | null>
  defines?: Record<string, string>
  stdin?: string
  stdout?: "piped" | "inherit"
  stderr?: "piped" | "inherit"
  logFileOpens?: boolean
}

export type TCCWorkerResult = {
  code: number
  stdout: string
  stderr: string
}

const loadTCCBinary = async () => {
  const { arch } = await import("node:process")
  switch (arch) {
  case "x64":
    // make cross-x86_64
    // emcc -sEXPORT_ES6 -sENVIRONMENT=worker -sEXPORTED_RUNTIME_METHODS=ENV,FS,callMain,ccall,cwrap -O2 -DTCC_TARGET_X86_64 -DCONFIG_TCC_CROSSPREFIX="\"x86_64-\"" -o x86_64-tcc.js tcc.c
    return await import("./tinycc-bundle/x86_64-tcc.wasm", { with: { type: "bytes" } })
  case "arm64":
    // make cross-arm64
    // emcc -sEXPORT_ES6 -sENVIRONMENT=worker -sEXPORTED_RUNTIME_METHODS=ENV,FS,callMain,ccall,cwrap -O2 -DTCC_TARGET_ARM64 -DCONFIG_TCC_CROSSPREFIX="\"arm64-\"" -o arm64-tcc.js tcc.c
    return await import("./tinycc-bundle/arm64-tcc.wasm", { with: { type: "bytes" } })
  case "riscv64":
    // make cross-riscv64
    // emcc -sEXPORT_ES6 -sENVIRONMENT=worker -sEXPORTED_RUNTIME_METHODS=ENV,FS,callMain,ccall,cwrap -O2 -DTCC_TARGET_RISCV64 -DCONFIG_TCC_CROSSPREFIX="\"riscv64-\"" -o riscv64-tcc.js tcc.c
    return await import("./tinycc-bundle/riscv64-tcc.wasm", { with: { type: "bytes" } })
  default:
    throw new Error(`unsupported tinycc arch '${arch}'`)
  }
}

const loadTCCLibraries = async () => {
  return {
    arm64: await import("./tinycc-bundle/arm64-libtcc1.a", { with: { type: "bytes" } }),
    riscv64: await import("./tinycc-bundle/riscv64-libtcc1.a", { with: { type: "bytes" } }),
    x86_64: await import("./tinycc-bundle/x86_64-libtcc1.a", { with: { type: "bytes" } }),
  }
}

const loadTCCIncludes = async () => {
  return {
    float: await import("./tinycc-bundle/include/float.h", { with: { type: "bytes" } }),
    stdalign: await import("./tinycc-bundle/include/stdalign.h", { with: { type: "bytes" } }),
    stdarg: await import("./tinycc-bundle/include/stdarg.h", { with: { type: "bytes" } }),
    stdatomic: await import("./tinycc-bundle/include/stdatomic.h", { with: { type: "bytes" } }),
    stdbool: await import("./tinycc-bundle/include/stdbool.h", { with: { type: "bytes" } }),
    stddef: await import("./tinycc-bundle/include/stddef.h", { with: { type: "bytes" } }),
    stdnoreturn: await import("./tinycc-bundle/include/stdnoreturn.h", { with: { type: "bytes" } }),
    tccdefs: await import("./tinycc-bundle/include/tccdefs.h", { with: { type: "bytes" } }),
    tgmath: await import("./tinycc-bundle/include/tgmath.h", { with: { type: "bytes" } }),
    varargs: await import("./tinycc-bundle/include/varargs.h", { with: { type: "bytes" } }),
  }
}

const getSystemTriplet = async () => {
  const { arch } = await import("node:process")

  const systemTripletArch = (() => {
    switch (arch) {
    case "x64":
      return "x86_64"
    case "arm64":
      return "aarch64"
    case "riscv64":
      return "riscv64"
    default:
      throw new Error(`unsupported tinycc arch '${arch}'`)
    }
  })()

  const systemTripletOS = "linux"

  const systemTripletAbi = (() => {
    switch (systemTripletArch) {
    case "x86_64":
      return "gnu"
    case "aarch64":
      return "gnueabihf"
    case "riscv64":
      return "gnu"
    }
  })()

  const systemTriplet = `${systemTripletArch}-${systemTripletOS}-${systemTripletAbi}`
  return systemTriplet
}

const findSystemLibraryPath = async () => {
  const { existsSync } = await import("node:fs")
  const systemTriplet = await getSystemTriplet()

  const libTripletDir = `/usr/lib/${systemTriplet}`
  if (existsSync(`${libTripletDir}/crti.o`)) {
    return libTripletDir
  }

  const lib64Dir = `/usr/lib64`
  if (existsSync(`${lib64Dir}/crti.o`)) {
    return lib64Dir
  }

  throw new Error("unsupported system")
}

const createStdIO = () => {
  const io = {
    stdinIndex: 0,
    stdinText: "",
    stdoutText: "",
    stderrText: "",
    reset: () => {
      io.stdinIndex = 0
      io.stdinText = ""
      io.stdoutText = ""
      io.stderrText = ""
    },
    stdin: () => {
      if (io.stdinIndex >= io.stdinText.length) {
        return undefined
      }
      return io.stdinText[io.stdinIndex++]!.charCodeAt(0)
    },
    stdout: (char: number) => {
      io.stdoutText += String.fromCharCode(char)
    },
    stderr: (char: number) => {
      io.stderrText += String.fromCharCode(char)
    },
  }

  return io
}

const TCC_VIRTUAL_DIR = "/__virtual"

const modifyEmscriptenFS = async (FS: EmscriptenModule["FS"]) => {
  const { existsSync } = await import("node:fs")
  const { dirname } = await import("node:path")
  const { cwd } = await import("node:process")

  const systemLibraryPath = await findSystemLibraryPath()

  FS.currentPath = cwd()

  const FS_exists = (path: string) => {
    try {
      FS.stat(path)
      return true
    } catch {
      return false
    }
  }

  const createdFiles = new Map<string, number>()
  let preventRecursion = false
  const FS_open = FS.open
  FS.open = (path, flags, mode) => {
    if (!preventRecursion) {
      console.log("FS_open", path)

      if (!FS_exists(path)) {
        let realpath = path.replace("//", "")

        if (realpath.startsWith("/usr/lib/")) {
          realpath = realpath.replace("/usr/lib/", `${systemLibraryPath}/`)
        }

        if (existsSync(realpath)) {
          preventRecursion = true
          try {
            FS.createPath("/", dirname(path))
            FS.writeFile(path, Deno.readFileSync(realpath))
          } finally {
            preventRecursion = false
          }
        }
      }
    }

    if (flags === 0o101101) {
      createdFiles.set(path, mode ?? 0)
    }

    return FS_open(path, flags, mode)
  }

  FS.mkdir(TCC_VIRTUAL_DIR)

  return {
    createdFiles,
  }
}

const writeTCCBundle = async (FS: EmscriptenModule["FS"]) => {
  const tccLibraries = await loadTCCLibraries()
  const tccIncludes = await loadTCCIncludes()

  const tccLibrariesDir = `${TCC_VIRTUAL_DIR}/__tcc`
  FS.mkdir(tccLibrariesDir)
  for (const [key, imported] of Object.entries(tccLibraries)) {
    FS.writeFile(`${tccLibrariesDir}/${key}-libtcc1.a`, imported.default)
  }
  const tccIncludesDir = `${tccLibrariesDir}/include`
  FS.mkdir(tccIncludesDir)
  for (const [key, imported] of Object.entries(tccIncludes)) {
    FS.writeFile(`${tccIncludesDir}/${key}.h`, imported.default)
  }

  return {
    tccBundleDir: tccLibrariesDir,
  }
}

const instantiateTCCBinary = async () => {
  const { default: wasmBinary } = await loadTCCBinary()
  const { default: tcc } = await import("./tcc-glue.js")

  const stdio = createStdIO()
  const tccResult = await tcc({
    wasmBinary,
    noInitialRun: true,
    stdin: stdio.stdin,
    stdout: stdio.stdout,
    stderr: stdio.stderr,
  } as EmscriptenParams) as EmscriptenModule

  const {
    createdFiles,
  } = await modifyEmscriptenFS(tccResult.FS)

  const {
    tccBundleDir,
  } = await writeTCCBundle(tccResult.FS)

  return {
    ...tccResult,
    stdio,
    createdFiles,
    tccBundleDir,
  }
}

const createTCCArguments = async (message: TCCWorkerMessage, { FS }: { FS: EmscriptenModule["FS"] }) => {
  const { createHash } = await import("node:crypto")
  const { dirname, basename, isAbsolute } = await import("node:path")

  const hash = message.outputIfChanged ? createHash("sha1") : undefined
  const args = [...new Set([
    ...(message.outputPath ? [`-o${message.outputPath}`] : []),
    ...(message.arguments ?? [])
      .flatMap(arg => {
        if (typeof arg === "string") {
          if (arg.startsWith("-l")) {
            const lib = arg.slice(2)
            if (isAbsolute(lib)) {
              return [`-L${dirname(lib)}`, `-l${basename(lib)}`]
            }
          }
          return [arg]
        }
        if (arg instanceof Uint8Array) {
          const path = `${TCC_VIRTUAL_DIR}/${crypto.randomUUID()}.c`
          FS.writeFile(path, arg)
          hash?.update(arg)
          return [path]
        }
        throw new Error(Deno.inspect(arg))
      }),
    ...Object.entries(message.defines ?? {})
      .flatMap(([define, value]) => {
        return [`-D${define}=${value}`]
      }),
    ...Object.entries(message.library ?? {})
      .flatMap(([library, data]) => {
        if (data) {
          library = `${TCC_VIRTUAL_DIR}/${library}`
          FS.writeFile(library, data)
        }
        if (isAbsolute(library)) {
          return [`-L${dirname(library)}`, `-l${basename(library)}`]
        } else {
          return [`-l${library}`]
        }
      }),
    ...Object.entries(message.include ?? {})
      .flatMap(([include, data]) => {
        if (data) {
          include = `${TCC_VIRTUAL_DIR}/${include}`
          FS.writeFile(include, data)
          hash?.update(data)
        }
        if (include.endsWith(".h")) {
          return [`-I${dirname(include)}`]
        } else {
          return [`-I${include}`]
        }
      }),
    ...Object.entries(message.sources ?? {})
      .flatMap(([source, data]) => {
        if (data) {
          source = `${TCC_VIRTUAL_DIR}/${source}`
          FS.writeFile(source, data)
          hash?.update(data)
        }
        return [source]
      }),
  ])]

  for (const arg of args) {
    if (!arg.startsWith("-o")) {
      hash?.update(arg)
    }
  }

  return {
    args,
    hash: hash?.digest("hex"),
  }
}

const WORKER_URL = new URL(import.meta.url)
if (WORKER_URL.searchParams.has("worker")) {
  const {
    FS,
    callMain,
    stdio,
    createdFiles,
    tccBundleDir,
  } = await instantiateTCCBinary()

  const createWorkerResult = (code: number, stderr?: string): TCCWorkerResult => {
    return {
      code,
      stdout: stdio.stdoutText,
      stderr: stderr ?? stdio.stderrText,
    }
  }

  self.postMessage(undefined)

  self.onmessage = async (event: MessageEvent<TCCWorkerMessage>) => {
    const message = event.data

    try {
      const {
        args,
        hash,
      } = await createTCCArguments(message, { FS })
      if (hash && message.outputPath) {
        const hashPath = `${message.outputPath}.hash`
        const existingHash = await (async () => {
          try {
            return await Deno.readTextFile(hashPath)
          } catch {
            return undefined
          }
        })()

        if (hash === existingHash) {
          self.postMessage(createWorkerResult(0))
          return
        }

        await Deno.writeTextFile(hashPath, hash)
      }

      // if (message.logFileOpens) {
      //   logFileOpens = true
      // }

      if (message.stdin) {
        stdio.stdinText = message.stdin
      }

      const code = callMain([`-B${tccBundleDir}`, ...args])

      for (const [file, mode] of createdFiles) {
        await Deno.writeFile(file, FS.readFile(file), { mode })
      }
      createdFiles.clear()

      const result = createWorkerResult(code)

      stdio.reset()

      // logFileOpens = false

      if (result.stdout && message.stdout === "inherit") {
        console.log(result.stdout)
      }
      if (result.stderr && message.stderr === "inherit") {
        console.error(result.stderr)
      }

      self.postMessage(result)
    } catch (error) {
      self.postMessage(createWorkerResult(-1, String(error)))
    }
  }
}

/**
 * https://bellard.org/tcc/tcc-doc.html
 */
export class TCCWorker extends Worker {
  private _ready = Promise.withResolvers<void>()

  private _task?: PromiseWithResolvers<TCCWorkerResult>

  private _onConnect = (event: MessageEvent<undefined>) => {
    this.removeEventListener("message", this._onConnect)
    this.addEventListener("message", this._onMessage)

    this._ready.resolve()
  }

  private _onMessage = (event: MessageEvent<TCCWorkerResult>) => {
    const result = event.data

    const { resolve } = this._task!
    this._task = undefined

    return resolve(result)
  }

  constructor() {
    const url = new URL(import.meta.url)
    url.searchParams.set("worker", String(true))
    super(url, {
      type: "module",
    })

    this.addEventListener("message", this._onConnect)
  }

  [Symbol.dispose]() {
    this.terminate()
  }

  compile(message: TCCWorkerMessage) {
    this._task = Promise.withResolvers()
    this.postMessage(message)
    return this._task.promise
  }

  static async compile(message: TCCWorkerMessage) {
    using worker = new TCCWorker()
    await worker.ready

    const result = await worker.compile(message)
    return result
  }

  async dlopen<const S extends Deno.ForeignLibraryInterface>(message: TCCWorkerMessage & { symbols: S }) {
    const temp = !message.outputPath
    const file = temp ? await Deno.makeTempFile() : message.outputPath!
    const info = await this.compile({
      ...message,
      arguments: [...(message.arguments ?? []), "-shared", `-o${file}`],
    })

    if (info.code !== 0) {
      throw new Error(info.stderr)
    }

    const lib = Deno.dlopen(file, message.symbols)
    const close = () => {
      try {
        lib.close()
        if (temp) {
          Deno.removeSync(file)
        }
      } catch {
        // ignore
      }
    }

    globalThis.addEventListener("unload", close)

    return {
      symbols: lib.symbols,
      close,
      file,
    } as Deno.DynamicLibrary<S>
  }

  static async dlopen<const S extends Deno.ForeignLibraryInterface>(message: TCCWorkerMessage & { symbols: S }) {
    using worker = new TCCWorker()
    await worker.ready

    const result = await worker.dlopen(message)
    return result
  }

  get ready() {
    return this._ready.promise
  }

  get idle() {
    return !this._task
  }
}
