// @targets cc
// @expect pass
// @stdout values 4 4 4 4
// @stdout values undefined undefined undefined null

type Options = {
  count?: number
}

function logValues(options: Options, useCount: boolean): void {
  const assigned: number | null | undefined = options.count
  const conditional = useCount ? options.count : null

  console.log(`values ${options.count}`, options.count, assigned, conditional)
}

logValues({ count: 4 }, true)
logValues({}, false)
