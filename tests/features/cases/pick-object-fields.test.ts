// @targets cc
// @expect pass
// @stdout picked 3

type Options = {
  name: string
  count: number
}

const options: Pick<Options, 'count'> = { count: 3 }
console.log('picked', options.count)
