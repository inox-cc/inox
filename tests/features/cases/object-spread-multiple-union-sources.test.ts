// @targets cc
// @expect pass
// @stdout 1

type LeftA = { a: number }
type LeftB = { b: number }
type Left = LeftA | LeftB

type RightX = { value: boolean; x: number }
type RightY = { value: number; y: number }
type Right = RightX | RightY

type CombinedAY = { a: number; value: number; y: number }
type CombinedAX = { a: number; value: boolean; x: number }
type CombinedBY = { b: number; value: number; y: number }
type CombinedBX = { b: number; value: boolean; x: number }
type Combined = CombinedAY | CombinedAX | CombinedBY | CombinedBX

function combine(left: Left, right: Right): Combined {
  const combined: Combined = { ...left, ...right }
  return combined
}

combine({ a: 1 }, { value: true, x: 2 })
console.log(1)
