// @targets cc
// @expect pass
// @stdout ADA

function consume<T>(value: T, callback: (value: T) => void): void {
  callback(value)
}

consume('Ada', item => console.log(item.toUpperCase()))
