// @targets cc
// @expect pass
// @stdout field

function isTemplateWhitespace(value: string): boolean {
  return value === ' ' || value === '\n' || value === '\r' || value === '\t' || value === '\f' || value === '\v'
}

function trimLeadingTemplateWhitespace(value: string): string {
  let index = 0

  while (index < value.length && isTemplateWhitespace(value[index])) {
    index = index + 1
  }

  return value.slice(index)
}

console.log(trimLeadingTemplateWhitespace('field'))
