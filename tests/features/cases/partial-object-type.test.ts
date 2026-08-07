// @targets cc
// @expect pass
// @stdout default 3

type Options = {
  name: string
  count: number
}

function configured(options: Partial<Options>): Options {
  return {
    name: 'default',
    count: 1,
    ...options
  }
}

const value = configured({ count: 3 })
console.log(value.name, value.count)
