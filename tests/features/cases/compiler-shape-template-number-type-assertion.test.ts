// @targets cc
// @expect pass
// @stdout value=1

type TemplateScalar = string | number

function printRemainder(value: TemplateScalar): void {
  if (typeof value !== 'number') {
    return
  }

  console.log(`value=${(value as number) % 2}`)
}

printRemainder(5)
