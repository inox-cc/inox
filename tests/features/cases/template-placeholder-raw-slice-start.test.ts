// @targets cc
// @expect pass
// @stdout field.declaredType

function firstTemplatePlaceholder(raw: string): string {
  let index = 1
  let end = raw.length

  if (raw.endsWith('`')) {
    end = raw.length - 1
  }

  while (index < end) {
    if (raw[index] === '$' && raw[index + 1] === '{') {
      index = index + 2
      const start = index

      while (index < end && raw[index] !== '}') {
        index = index + 1
      }

      return raw.slice(start, index)
    }

    index = index + 1
  }

  return ''
}

console.log(firstTemplatePlaceholder('`${field.declaredType} ${field.loc.line}`'))
