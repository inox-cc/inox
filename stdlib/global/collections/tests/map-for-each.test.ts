// @targets cc
// @expect pass
// @stdout a 1 1
// @stdout b 2 1

const values = new Map<string, number>([['a', 1], ['b', 2]])

values.forEach((value, key, map) => {
  console.log(key, value, map === values)
})
