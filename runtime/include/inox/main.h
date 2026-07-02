#ifndef INOX_MAIN_H
#define INOX_MAIN_H

#include "inox/allocator.h"
#include "inox/loop.h"
#include "inox/promise.h"
#include "inox/time.h"
#include "inox/value.h"

#ifdef __cplusplus

namespace inox {

using AppMain = int (*)(void);
using AppStatusMain = inox_status (*)(void);

inline int status_exit_code(inox_status status) {
  return status == INOX_OK ? 0 : 1;
}

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

inline inox_status run_status_app(AppStatusMain app_main) {
  RuntimeContext runtime(&inox_default_allocator, inox_performance_now());

  if (!runtime) {
    return INOX_ERR_TYPE;
  }

  const inox_status status = app_main();

  if (status != INOX_OK) {
    return status;
  }

  return run();
}

inline int main(AppStatusMain app_main) {
  return return_code(status_exit_code(run_status_app(app_main)));
}

} // namespace inox

#endif

#endif
