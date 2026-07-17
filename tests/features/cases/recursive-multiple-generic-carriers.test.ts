// @targets cc
// @expect pass
// @stdout left:right

type EmitContextWithDependencies<LeftDependencies, RightDependencies> = {
  leftDependencies: LeftDependencies
  rightDependencies: RightDependencies
}

type FunctionContextWithDependencies<LeftDependencies, RightDependencies> =
  EmitContextWithDependencies<LeftDependencies, RightDependencies> & {
    value: string
  }

type LeftDependencies = {
  read(context: Context): string
}

type RightDependencies = {
  read(context: Context): string
  find(context: Context): string | null
}

type Context = FunctionContextWithDependencies<LeftDependencies, RightDependencies>

function read(context: Context): string {
  return (
    context.leftDependencies.read(context) +
    ':' +
    (context.rightDependencies.find(context) ?? context.rightDependencies.read(context))
  )
}

const context: Context = {
  leftDependencies: { read: () => 'left' },
  rightDependencies: { read: () => 'right', find: () => null },
  value: 'unused'
}

console.log(read(context))
