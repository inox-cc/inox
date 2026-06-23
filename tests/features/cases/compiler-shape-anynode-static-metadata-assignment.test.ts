// @targets c
// @expect pass
// @stdout static

type AnyNode = { [key: string]: any }

function attachStaticMetadata(field: AnyNode): void {
  field.static = true
  field.staticLoc = {
    line: 1,
    column: 1,
    file: 'input.ts'
  }
}

const field: AnyNode = {
  name: 'create',
  valueType: 'function'
}

attachStaticMetadata(field)

if (field.static === true && field.staticLoc.file === 'input.ts') {
  console.log('static')
}
