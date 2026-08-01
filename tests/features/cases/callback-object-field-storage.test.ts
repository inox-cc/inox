// @targets cc
// @expect pass

type CallbackHolder = {
  callback: (value: string) => string
}

const prefix = 'stored:'
const holder: CallbackHolder = {
  callback: (value) => prefix + value
}

function invoke(value: CallbackHolder): string {
  return value.callback('value')
}

invoke(holder)

const holders: CallbackHolder[] = [holder]

for (const item of holders) {
  item.callback('indexed')
}
