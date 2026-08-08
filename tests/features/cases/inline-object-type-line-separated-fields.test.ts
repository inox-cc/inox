// @targets cc
// @expect pass
// @stdout inox 2 1

const value = { name: 'inox', count: 2, ready: true } as {
  name: string
  count: number
  ready: boolean
}

console.log(value.name, value.count, value.ready)
