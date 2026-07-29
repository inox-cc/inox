// @targets cc
// @expect pass
// @stdout ready

function read(): string {
  return settings.status
}

const settings = { status: 'ready' }

console.log(read())
