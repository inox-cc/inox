// @targets cc
// @expect pass
// @stdout captured:value

function prefixWith(prefix: string): (value: string) => string {
  return value => prefix + value
}

const callback = prefixWith('captured:')
console.log(callback('value'))
