// @targets cc
// @expect pass
// @stdout 3

type Options = {
  sources: Array<{ argumentIndex: number } | null>
}

const options: Options = {
  sources: [null, { argumentIndex: 3 }]
}

for (const source of options.sources) {
  if (source !== null) {
    console.log(source.argumentIndex)
  }
}
