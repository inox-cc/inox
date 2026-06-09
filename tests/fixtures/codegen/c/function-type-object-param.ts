// @targets c
// @expect pass
// @stdout Ada

type Person = {
  name: string
};

type PersonCallback = (value: Person) => void;

function run(callback: PersonCallback, person: Person): void {
  callback(person)
}

function hello(value: Person): void {
  console.log(value.name)
}

export function main(): void {
  const person: Person = {
    name: 'Ada'
  }
  const callback: PersonCallback = hello
  run(callback, person)
}
