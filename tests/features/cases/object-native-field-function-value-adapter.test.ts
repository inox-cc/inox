// @targets cc
// @expect pass
// @stdout 1

type Holder = {
  values: Set<string>
}

function includes(values: Set<string>): boolean {
  return values.has('selected')
}

const holder: Holder = {
  values: new Set()
}

holder.values.add('selected')
console.log(includes(holder.values) ? 1 : 0)
