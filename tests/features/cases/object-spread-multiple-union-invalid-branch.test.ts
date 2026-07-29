// @targets cc
// @expect diagnostics INOX_TYPE_MISMATCH

type LeftA = { a: number }
type LeftB = { b: number }
type Left = LeftA | LeftB

type RightX = { x: number }
type RightY = { y: number }
type Right = RightX | RightY

type CombinedAX = { a: number; x: number }
type CombinedAY = { a: number; y: number }
type CombinedBY = { b: number; y: number }
type Combined = CombinedAX | CombinedAY | CombinedBY

function combine(left: Left, right: Right): Combined {
  const combined: Combined = { ...left, ...right }
  return combined
}
