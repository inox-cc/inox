#include "inox/time_bridge.h"

#include <chrono>

#if defined(_WIN32)
#include <windows.h>
#else
#include <errno.h>
#include <time.h>
#endif

extern "C" inox_number inox_monotonic_now_ms(void) {
  const std::chrono::steady_clock::duration elapsed = std::chrono::steady_clock::now().time_since_epoch();

  return std::chrono::duration<inox_number, std::milli>(elapsed).count();
}

extern "C" void inox_time_sleep_ms(inox_number delay_ms) {
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
