#include "ccjs/time.h"

#include <time.h>

static ccjs_number ccjs_default_monotonic_now_ms(void* user);
static ccjs_number ccjs_default_wall_now_ms(void* user);
static ccjs_number ccjs_timespec_ms(const struct timespec* value);
static void ccjs_time_ensure_initialized(void);

static ccjs_time_adapter ccjs_time_current_adapter = {
  0,
  ccjs_default_monotonic_now_ms,
  ccjs_default_wall_now_ms
};
static int ccjs_time_initialized = 0;
static ccjs_number ccjs_performance_base_ms = 0;
static ccjs_number ccjs_wall_base_ms = 0;
static ccjs_number ccjs_wall_base_monotonic_ms = 0;

void ccjs_time_set_adapter(ccjs_time_adapter adapter) {
  if (adapter.monotonic_now_ms == 0) {
    adapter.monotonic_now_ms = ccjs_default_monotonic_now_ms;
  }

  if (adapter.wall_now_ms == 0) {
    adapter.wall_now_ms = ccjs_default_wall_now_ms;
  }

  ccjs_time_current_adapter = adapter;
  ccjs_time_initialized = 0;
}

void ccjs_time_reset_adapter(void) {
  ccjs_time_adapter adapter = {
    0,
    ccjs_default_monotonic_now_ms,
    ccjs_default_wall_now_ms
  };

  ccjs_time_set_adapter(adapter);
}

void ccjs_time_resync_wall_clock(void) {
  ccjs_time_ensure_initialized();

  ccjs_wall_base_monotonic_ms = ccjs_time_current_adapter.monotonic_now_ms(ccjs_time_current_adapter.user);
  ccjs_wall_base_ms = ccjs_time_current_adapter.wall_now_ms(ccjs_time_current_adapter.user);
}

ccjs_number ccjs_performance_now(void) {
  ccjs_time_ensure_initialized();

  return ccjs_time_current_adapter.monotonic_now_ms(ccjs_time_current_adapter.user) - ccjs_performance_base_ms;
}

ccjs_number ccjs_date_now(void) {
  ccjs_time_ensure_initialized();

  return ccjs_wall_base_ms + (ccjs_time_current_adapter.monotonic_now_ms(ccjs_time_current_adapter.user) - ccjs_wall_base_monotonic_ms);
}

static void ccjs_time_ensure_initialized(void) {
  if (ccjs_time_initialized) {
    return;
  }

  ccjs_performance_base_ms = ccjs_time_current_adapter.monotonic_now_ms(ccjs_time_current_adapter.user);
  ccjs_wall_base_monotonic_ms = ccjs_performance_base_ms;
  ccjs_wall_base_ms = ccjs_time_current_adapter.wall_now_ms(ccjs_time_current_adapter.user);
  ccjs_time_initialized = 1;
}

static ccjs_number ccjs_default_monotonic_now_ms(void* user) {
  (void)user;

#if defined(CLOCK_MONOTONIC)
  struct timespec value;

  if (clock_gettime(CLOCK_MONOTONIC, &value) == 0) {
    return ccjs_timespec_ms(&value);
  }
#endif

  return ((ccjs_number)clock() * 1000.0) / (ccjs_number)CLOCKS_PER_SEC;
}

static ccjs_number ccjs_default_wall_now_ms(void* user) {
  (void)user;

#if defined(CLOCK_REALTIME)
  {
    struct timespec value;

    if (clock_gettime(CLOCK_REALTIME, &value) == 0) {
      return ccjs_timespec_ms(&value);
    }
  }
#endif

#if defined(TIME_UTC)
  {
    struct timespec value;

    if (timespec_get(&value, TIME_UTC) == TIME_UTC) {
      return ccjs_timespec_ms(&value);
    }
  }
#endif

  return ccjs_default_monotonic_now_ms(user);
}

static ccjs_number ccjs_timespec_ms(const struct timespec* value) {
  return ((ccjs_number)value->tv_sec * 1000.0) + ((ccjs_number)value->tv_nsec / 1000000.0);
}
