export class CSV {
  static stringify(data: Record<string, any>[]) {
    const separator = ","
    const escape = "\""
    const escapeRegex = new RegExp(escape, "gm")
    const newline = "\n"

    let result = ""

    for (const record of data) {
      if (result === "") {
        result += Object.keys(record)
          .filter(k => record[k] !== undefined)
          .join(separator)
        result += "\n"
      }

      result += Object.values(record)
        .filter(v => v !== undefined)
        .map(_v => {
          let v = String(_v)

          v = v.replace(escapeRegex, escape + escape)

          if (v.includes(separator) || v.includes(escape) || v.includes(newline)) {
            v = escape + v + escape
          }

          return v
        })
        .join(separator)
      result += "\n"
    }

    return result
  }
}
