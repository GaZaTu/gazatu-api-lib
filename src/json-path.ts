const jsonpathRegex = /[\[\.]/

export class JSONPath {
  constructor(
    private readonly _path: (string | number)[],
  ) {}

  static parse(path: string) {
    const pathAsArray = path.split(jsonpathRegex)
      .filter(p => p !== "$")
      .map(p => p.endsWith("]") ? p.slice(0, -1) : p)
      .map(p => isNaN(Number(p)) ? p : Number(p))
    const result = new this(pathAsArray)
    return result
  }

  findProperty<T = any>(root: any) {
    if (!root) {
      return undefined
    }

    let container = root
    for (let i = 0; i < this._path.length - 1; i++) {
      container = container[this._path[i]!]
      if (!container) {
        return undefined
      }
    }

    const key = this._path[this._path.length - 1]
    if (!key) {
      return {
        read: () => container as T,
        write: (value: T) => {
          // ignore
        },
      }
    }

    return {
      read: () => container[key] as T,
      write: (value: T) => {
        container[key] = value
      },
    }
  }

  static findProperty<T = any>(root: any, path: string) {
    return this.parse(path).findProperty<T>(root)
  }

  read<T = any>(root: any) {
    return this.findProperty<T>(root)?.read()
  }

  static read<T = any>(root: any, path: string) {
    return this.findProperty<T>(root, path)?.read()
  }

  write<T = any>(root: any, value: T) {
    this.findProperty<T>(root)?.write(value)
  }

  static write<T = any>(root: any, path: string, value: T) {
    return this.findProperty<T>(root, path)?.write(value)
  }
}
