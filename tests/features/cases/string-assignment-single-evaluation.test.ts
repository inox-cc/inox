// @targets cc
// @expect pass
// @stdout updated 1

let calls = 0

function nextValue(): string {
  calls = calls + 1
  return 'updated'
}

function checkAssignment(): void {
  let value = 'initial'
  value = nextValue()
  console.log(value, calls)
}

checkAssignment()
