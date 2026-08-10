// @targets cc
// @expect pass
// @stdout inox

interface Named<T extends string = string> {
  name: T
}

const value: Named = { name: 'inox' }
console.log(value.name)
