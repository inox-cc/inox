#include "inox/main.h"

#include "inox/allocator.h"
#include "inox/loop.h"
#include "inox/promise_runtime.h"

int inox::run_app(AppMain app_main) {
  RuntimeContext runtime(&inox_default_allocator);

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
  const int result = run_app(app_main);
  return !inox_promise_has_unhandled_rejection() ? result : 1;
}
