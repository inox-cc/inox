// @targets cc
// @expect pass
// @stdout a,b
// @stdout empty

type JoinOptions = {
  values?: string[]
}

function joinValues(options: JoinOptions): string {
  return (options.values ?? []).join(',')
}

console.log(joinValues({ values: ['a', 'b'] }))

if (joinValues({}) === '') {
  console.log('empty')
}
