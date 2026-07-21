// @targets cc
// @expect pass
// @stdout cc

type Host = {
  resolve(value: string): string
}

type Options = {
  host?: Host
  target: string
}

function createOptions(): Options {
  const options: Options = { target: 'cc' }
  return options
}

console.log(createOptions().target)
