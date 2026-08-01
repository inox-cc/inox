// @targets cc
// @expect pass
// @stdout returned:value

function make(): (value: string) => string {
  return value => 'returned:' + value
}

const callback = make()
console.log(callback('value'))
