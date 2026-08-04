// @targets cc
// @expect pass
// @stdout 1

class Example {
  value: number

  constructor() {
    this.value = 1
  };

  read(): number {
    return this.value
  };
}

console.log(new Example().read())
