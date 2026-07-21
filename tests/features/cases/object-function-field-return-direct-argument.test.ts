// @targets cc
// @expect pass
// @stdout 2

type Worker = (value: number) => number

type Carrier = {
  work: Worker
}

function plusOne(value: number): number {
  return value + 1
}

function make(): Carrier {
  return { work: plusOne }
}

function apply(carrier: Carrier): number {
  return carrier.work(1)
}

console.log(apply(make()))
