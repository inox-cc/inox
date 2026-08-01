// @targets cc
// @expect pass
// @stdout value

type Lines = {
  read(): string[]
}

function readLines(): string[] {
  return ['value']
}

const lines: Lines = {
  read: readLines
}

console.log(lines.read()[0])
