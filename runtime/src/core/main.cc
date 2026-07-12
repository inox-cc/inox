#include "inox/main.h"

#include "inox/allocator.h"
#include "inox/loop.h"
#include "inox/promise.h"
#include "inox/time_bridge.h"

int inox::run_app(AppMain app_main) {
  RuntimeContext runtime(&inox_default_allocator, inox_performance_now());

  if (!runtime) {
    return 1;
  }

  app_main();

  if (thrown()) {
    return 1;
  }

  if (run() != INOX_OK) {
    return 1;
  }

  if (thrown()) {
    return 1;
  }

  return 0;
}

int inox::main(AppMain app_main) {
  return return_code(run_app(app_main));
}
