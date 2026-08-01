// @targets cc
// @expect pass
// @stdout 1

type SetFactory = {
  create(): Set<string>
}

function createNames(): Set<string> {
  return new Set<string>(['value'])
}

const factory: SetFactory = {
  create: createNames
}

const names = factory.create()
console.log(names.has('value'))
