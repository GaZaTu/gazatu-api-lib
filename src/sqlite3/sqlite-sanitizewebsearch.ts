export const sanitizeWebSearch = (search: string) => {
  let result = ""

  let quoted = false
  let quotedAuto = false
  let quotedStartIdx = 0
  let quotedEndIdx = 0
  let negateNext = false

  const quote = (i: number) => {
    if (!quotedAuto) {
      if (quoted && (i - quotedStartIdx) === 1) {
        quotedStartIdx += 1
        return
      }

      if (!quoted && (i - quotedEndIdx) === 1 && i > 0) {
        quotedEndIdx += 1
        return
      }
    }

    quoted = !quoted

    if (quoted) {
      quotedStartIdx = i
    } else {
      quotedEndIdx = i
    }

    if (quoted && result.length != 0) {
      if (negateNext) {
        negateNext = false
        result += " NOT "
      } else {
        result += " AND "
      }
    }

    result += "\""

    if (!quoted) {
      result += "*"
      quotedAuto = false
    }
  }

  for (let i = 0; i < search.length; i++) {
    const chr = search[i]!

    if (chr === "\"") {
      if (quotedAuto) {
        result += chr + chr
        continue
      }

      quote(i)
      continue
    }

    if (quoted) {
      if (chr.trim() === "" && quotedAuto) {
        quote(i)
        continue
      }
    } else {
      if (chr.trim() === "" || chr === "*" || chr === "+" || chr === "-") {
        negateNext = (chr === "-") && (result.length !== 0)
        continue
      }

      quotedAuto = true
      quote(i)
    }

    result += chr
  }

  if (quoted) {
    quotedStartIdx = -1
    quote(search.length)
  }

  if (result.trim() === "" || result === "*" || result === "+" || result === "-") {
    result = ""
  }

  return result
}
