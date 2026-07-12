// @targets cc
// @expect pass
// @stdout hello

type Logger = {
  log: (message: string) => void
}

function run(logger: Logger): void {
  logger.log('hello')
}

const logger: Logger = {
  log: (message: string) => console.log(message)
}

run(logger)
