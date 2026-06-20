// @targets c
// @expect pass
// @stdout callback:Ada
// @stdout direct:5
// @stdout nested:done

function call(callback: Function): void {
  callback()
}

function run(callback: Function): void {
  call(callback)
}

const name = 'Ada'
const callback: Function = () => {
  console.log('callback:' + name)
}

function readValue(): number {
  return 5
}

callback()
console.log('direct:' + String(readValue()))

run(() => {
  run(() => {
    console.log('nested:done')
  })
})
