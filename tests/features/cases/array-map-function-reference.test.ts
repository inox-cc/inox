// @targets cc
// @expect pass
// @stdout A B

function upper(value: string): string {
  return value.toUpperCase()
}

const values = [...['a', 'b'].map(upper)]
console.log(values.join(' '))
