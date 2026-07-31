// @targets cc
// @expect pass
// @stdout ADA

function preserve<T>(values: T[]): T[] {
  return values
}

const values = preserve(['Ada'])
console.log(values[0].toUpperCase())
