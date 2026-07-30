// @targets cc
// @expect pass
// @stdout called 3

type NumberConsumer = {
  consume?: (value: number) => void
}

function consume(value: number): void {
  console.log('called', value)
}

function run(consumer: NumberConsumer): void {
  consumer.consume?.(3)
}

run({ consume })
run({})
