// @targets c
// @expect pass
// @stdout compiler

const values: Map<string, string> = new Map()
values.set('kind', 'compiler')

console.log(values.get('kind') ?? 'missing')
