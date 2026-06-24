#include "inox/time.h"

#if defined(_WIN32)
#include <windows.h>
#else
#include <errno.h>
#endif
#include <time.h>

static inox_number inox_default_monotonic_now_ms(void* user);
static inox_number inox_default_wall_now_ms(void* user);
static inox_number inox_floor_ms(inox_number value);
static inox_number inox_timespec_ms(const struct timespec* value);
static void inox_time_ensure_initialized(void);

static inox_time_adapter inox_time_current_adapter = { 0, inox_default_monotonic_now_ms, inox_default_wall_now_ms };
static int inox_time_initialized = 0;
static inox_number inox_performance_base_ms = 0;
static inox_number inox_wall_base_ms = 0;
static inox_number inox_wall_base_monotonic_ms = 0;

void inox_time_set_adapter(inox_time_adapter adapter) {
  if (adapter.monotonic_now_ms == 0) {
    adapter.monotonic_now_ms = inox_default_monotonic_now_ms;
  }

  if (adapter.wall_now_ms == 0) {
    adapter.wall_now_ms = inox_default_wall_now_ms;
  }

  inox_time_current_adapter = adapter;
  inox_time_initialized = 0;
}

void inox_time_reset_adapter(void) {
  inox_time_adapter adapter = { 0, inox_default_monotonic_now_ms, inox_default_wall_now_ms };

  inox_time_set_adapter(adapter);
}

void inox_time_resync_wall_clock(void) {
  inox_time_ensure_initialized();

  inox_wall_base_monotonic_ms = inox_time_current_adapter.monotonic_now_ms(inox_time_current_adapter.user);
  inox_wall_base_ms = inox_time_current_adapter.wall_now_ms(inox_time_current_adapter.user);
}

inox_number inox_performance_now(void) {
  inox_time_ensure_initialized();

  return inox_time_current_adapter.monotonic_now_ms(inox_time_current_adapter.user) - inox_performance_base_ms;
}

inox_number inox_date_now(void) {
  inox_time_ensure_initialized();

  return inox_floor_ms(
    inox_wall_base_ms +
    (inox_time_current_adapter.monotonic_now_ms(inox_time_current_adapter.user) - inox_wall_base_monotonic_ms)
  );
}

void inox_time_sleep_ms(inox_number delay_ms) {
  if (delay_ms != delay_ms || delay_ms <= 0) {
    return;
  }

#if defined(_WIN32)
  DWORD milliseconds = delay_ms < 1 ? 1 : (DWORD)delay_ms;

  Sleep(milliseconds);
#else
  time_t seconds = (time_t)(delay_ms / 1000.0);
  long nanoseconds = (long)((delay_ms - ((inox_number)seconds * 1000.0)) * 1000000.0);

  if (nanoseconds < 0) {
    nanoseconds = 0;
  }

  if (nanoseconds > 999999999L) {
    seconds += 1;
    nanoseconds = 0;
  }

  struct timespec request = { seconds, nanoseconds };

  while (nanosleep(&request, &request) != 0 && errno == EINTR) {
  }
#endif
}

static void inox_time_ensure_initialized(void) {
  if (inox_time_initialized) {
    return;
  }

  inox_performance_base_ms = inox_time_current_adapter.monotonic_now_ms(inox_time_current_adapter.user);
  inox_wall_base_monotonic_ms = inox_performance_base_ms;
  inox_wall_base_ms = inox_time_current_adapter.wall_now_ms(inox_time_current_adapter.user);
  inox_time_initialized = 1;
}

static inox_number inox_default_monotonic_now_ms(void* user) {
  (void)user;

#if defined(CLOCK_MONOTONIC)
  struct timespec value;

  if (clock_gettime(CLOCK_MONOTONIC, &value) == 0) {
    return inox_timespec_ms(&value);
  }
#endif

  return ((inox_number)clock() * 1000.0) / (inox_number)CLOCKS_PER_SEC;
}

static inox_number inox_default_wall_now_ms(void* user) {
  (void)user;

#if defined(CLOCK_REALTIME)
  {
    struct timespec value;

    if (clock_gettime(CLOCK_REALTIME, &value) == 0) {
      return inox_timespec_ms(&value);
    }
  }
#endif

#if defined(TIME_UTC)
  {
    struct timespec value;

    if (timespec_get(&value, TIME_UTC) == TIME_UTC) {
      return inox_timespec_ms(&value);
    }
  }
#endif

  return inox_default_monotonic_now_ms(user);
}

static inox_number inox_floor_ms(inox_number value) {
  if (value != value) {
    return value;
  }

  long long truncated = (long long)value;

  return (inox_number)truncated > value ? (inox_number)(truncated - 1) : (inox_number)truncated;
}

static inox_number inox_timespec_ms(const struct timespec* value) {
  return ((inox_number)value->tv_sec * 1000.0) + ((inox_number)value->tv_nsec / 1000000.0);
}
