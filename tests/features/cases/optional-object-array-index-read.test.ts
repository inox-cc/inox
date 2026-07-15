// @targets cc
// @expect pass
// @stdout first

type Options = {
  names?: string[]
}

function printFirst(options: Options): void {
  const first = options.names?.[0]

  if (typeof first === 'string') {
    console.log(first)
  }
}

printFirst({ names: ['first'] })
