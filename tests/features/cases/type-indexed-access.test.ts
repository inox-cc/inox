// @targets cc
// @expect pass
// @stdout 3:ok

type Config = {
  count: number
  labels: string[]
}

type Count = Config['count']
type Label = Config['labels'][number]

function printConfig(count: Count, label: Label): void {
  console.log(`${count}:${label}`)
}

printConfig(3, 'ok')
