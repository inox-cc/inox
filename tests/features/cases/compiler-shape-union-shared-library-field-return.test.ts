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

const traits = carrierTraits({ kind: 'left', traits: [{ name: 'shared' }] })

if (traits.length > 0) {
  console.log(traits[0].name)
}
