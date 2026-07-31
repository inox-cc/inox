// @targets cc
// @expect diagnostics INOX_TYPE_ARGUMENT_COUNT

function pair<Left, Right>(left: Left, right: Right): Left {
  return left
}

pair<string>('left', 'right')
