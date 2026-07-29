// @targets cc
// @expect pass
// @stdout 2

type Config = {
  name: string
  count?: number
}

const config: Config = { name: 'inox' }

config.count = 2
console.log(config.count)
