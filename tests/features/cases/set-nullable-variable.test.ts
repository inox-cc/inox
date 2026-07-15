// @targets cc
// @expect pass
// @stdout one

let values: Set<string> | null = null

values = new Set<string>()
values.add('one')

for (const value of values) {
  console.log(value)
}
