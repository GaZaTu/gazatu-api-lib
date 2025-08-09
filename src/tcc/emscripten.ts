declare class EmscriptenErrnoError extends Error {
  constructor(errno: number)
}

declare class EmscriptenFSStream {
  static shared: Record<any, any>

  object: EmscriptenFSNode
  readonly isRead: boolean
  readonly isWrite: boolean
  readonly isAppend: boolean
  flags: number
  position: number

  constructor()
}

declare class EmscriptenFSNode {
  static node_ops: Record<any, any>
  static stream_ops: Record<any, any>
  static readMode: number
  static writeMode: number
  static mounted: unknown

  parent: EmscriptenFSNode
  mount: unknown
  id: number
  name: string
  mode: number
  rdev: unknown
  atime: number
  read: boolean
  write: boolean
  readonly isFolder: boolean
  readonly isDevice: boolean

  constructor(parent: EmscriptenFSNode | undefined, name: string, mode: number, rdev: unknown)
}

export type EmscriptenFS = {
  root: any
  mounts: any[]
  devices: Record<any, any>
  streams: any[]
  nextInode: number
  nameTable: any
  currentPath: string
  initialized: boolean
  ignorePermissions: boolean
  ErrnoError: typeof EmscriptenErrnoError
  filesystems: any
  syncFSRequests: number
  readFiles: Record<any, any>
  FSStream: typeof EmscriptenFSStream
  FSNode: typeof EmscriptenFSNode
  lookupPath: (path: string, opts?: unknown) => { path: string }
  getPath: () => void
  hashName: () => void
  hashAddNode: () => void
  hashRemoveNode: () => void
  lookupNode: () => void
  createNode: () => void
  destroyNode: () => void
  isRoot: () => void
  isMountpoint: () => void
  isFile: () => void
  isDir: () => void
  isLink: () => void
  isChrdev: () => void
  isBlkdev: () => void
  isFIFO: () => void
  isSocket: () => void
  flagsToPermissionString: () => void
  nodePermissions: () => void
  mayLookup: () => void
  mayCreate: () => void
  mayDelete: () => void
  mayOpen: () => void
  checkOpExists: () => void
  MAX_OPEN_FDS: () => void
  nextfd: () => void
  getStreamChecked: () => void
  getStream: () => void
  createStream: (stream: { node: EmscriptenFSNode, path: string, flags: number, seekable: boolean, position: number, stream_ops: unknown }, fs?: number) => EmscriptenFSStream
  closeStream: () => void
  dupStream: () => void
  chrdev_stream_ops: () => void
  major: () => void
  minor: () => void
  makedev: () => void
  registerDevice: () => void
  getDevice: () => void
  getMounts: () => void
  syncfs: () => void
  mount: () => void
  unmount: () => void
  lookup: () => void
  mknod: () => void
  statfs: () => void
  statfsStream: () => void
  statfsNode: () => void
  create: () => void
  mkdir: (path: string) => void
  mkdirTree: () => void
  mkdev: () => void
  symlink: () => void
  rename: () => void
  rmdir: () => void
  readdir: () => void
  unlink: (path: string) => void
  readlink: () => void
  stat: (path: string) => { mode: number }
  lstat: () => void
  chmod: () => void
  lchmod: () => void
  fchmod: () => void
  chown: () => void
  lchown: () => void
  fchown: () => void
  truncate: () => void
  ftruncate: () => void
  utime: () => void
  open: (path: string, flags: string | number, mode?: number) => EmscriptenFSStream
  close: () => void
  isClosed: () => void
  llseek: () => void
  read: () => void
  write: () => void
  allocate: () => void
  mmap: () => void
  msync: () => void
  ioctl: () => void
  readFile: (path: string) => Uint8Array
  writeFile: (path: string, data: string | Uint8Array) => void
  cwd: () => void
  chdir: () => void
  createDefaultDirectories: () => void
  createDefaultDevices: () => void
  createSpecialDirectories: () => void
  createStandardStreams: () => void
  staticInit: () => void
  init: () => void
  quit: () => void
  findObject: () => void
  analyzePath: () => void
  createPath: (parent: string | EmscriptenFSNode, path: string) => void
  createFile: () => void
  createDataFile: (parent: string | EmscriptenFSNode | undefined, name: string, data: string | Uint8Array, canRead: boolean, canWrite: boolean, canOwn?: boolean) => void
  createDevice: () => void
  forceLoadFile: () => void
  createLazyFile: () => void
  createPreloadedFile: () => void
}

export type EmscriptenParams = {
  arguments?: string[]
  wasmBinary?: Uint8Array
  noInitialRun?: boolean
  stdin?: () => number | undefined
  stdout?: (char: number) => void
  stderr?: (char: number) => void
}

export type EmscriptenModule = {
  ENV: Record<string, string>
  FS: EmscriptenFS
  callMain: (args?: string[]) => number
  ccall: (func: string, retType: string, argTypes: string[], args: any[]) => any
  cwrap: (func: string, retType: string, argTypes: string[]) => ((args: any[]) => any)
}
