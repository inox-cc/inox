#ifndef INOX_MAIN_H
#define INOX_MAIN_H

#include "inox/allocator.h"
#include "inox/loop.h"
#include "inox/promise.h"
#include "inox/time.h"

#ifdef __cplusplus

namespace inox {

using AppMain = int (*)(void);

inline int run_app(AppMain app_main) {
  RuntimeContext runtime(&inox_default_allocator, inox_performance_now());

  if (!runtime) {
    return 1;
  }

  const int code = app_main();

  if (code != 0) {
    return code;
  }

  if (run() != INOX_OK) {
    return 1;
  }

  return code;
}

inline int main(AppMain app_main) {
  return return_code(run_app(app_main));
}

} // namespace inox

#endif

#endif
