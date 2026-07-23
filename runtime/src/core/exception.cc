#include "inox/loop.h"

void inox::throw_out_of_memory() {
  throw_value(inox_undefined_value());
}
