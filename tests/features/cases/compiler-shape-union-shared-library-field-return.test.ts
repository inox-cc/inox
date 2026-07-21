// @targets cc
// @expect pass
// @stdout shared

type Trait = {
  name: string
}

type Left = {
  kind: 'left'
  traits: Trait[]
}

type Right = {
  kind: 'right'
  traits: Trait[]
}

type Carrier = Left | Right

function carrierTraits(carrier: Carrier): Trait[] {
  return carrier.traits
}

console.log(carrierTraits({ kind: 'left', traits: [{ name: 'shared' }] })[0].name)
