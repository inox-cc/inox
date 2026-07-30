// @targets cc
// @expect pass
// @stdout ready

type Prepared = {
  path: string[]
  expression: string
  metadata: object
}

const values: Prepared[] = []
const expression = 'ready'
const metadata: object = { kind: 'fixture' }

values.push({ path: [], expression, metadata })

if (values.length > 0) {
  console.log(values[0].expression)
}
