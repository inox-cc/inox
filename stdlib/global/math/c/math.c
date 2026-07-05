#if defined(_WIN32) && defined(_MSC_VER)
#define _CRT_RAND_S
#endif

#include "inox/math.h"

#include <stddef.h>

#if defined(_WIN32)
#include <stdlib.h>
#elif defined(__APPLE__) || defined(__FreeBSD__) || defined(__OpenBSD__) || defined(__NetBSD__) || defined(__DragonFly__)
#include <stdlib.h>
#else
#include <fcntl.h>
#include <unistd.h>
#if defined(__linux__)
#include <sys/random.h>
#endif
#endif

static uint32_t inox_math_random_state = 0x6d2b79f5u;
static inox_math_random_backend inox_math_random_current_backend = INOX_MATH_RANDOM_SIMPLE;

void inox_math_configure_random(uint32_t seed, inox_math_random_backend backend) {
  inox_math_random_state = seed;
  inox_math_random_current_backend = backend;
}

double inox_math_abs(double value) {
  return value < 0 ? -value : value;
}

double inox_math_floor(double value) {
  long long truncated = (long long)value;
  return (double)truncated > value ? (double)(truncated - 1) : (double)truncated;
}

double inox_math_ceil(double value) {
  long long truncated = (long long)value;
  return (double)truncated < value ? (double)(truncated + 1) : (double)truncated;
}

double inox_math_round(double value) {
  return inox_math_floor(value + 0.5);
}

double inox_math_trunc(double value) {
  return (double)((long long)value);
}

double inox_math_fround(double value) {
  return (double)((float)value);
}

double inox_math_min(double left, double right) {
  return left < right ? left : right;
}

double inox_math_max(double left, double right) {
  return left > right ? left : right;
}

double inox_math_sqrt(double value) {
  if (value < 0) return 0.0/0.0;
  if (value == 0) return 0;

  double estimate = value < 1 ? 1 : value;

  for (int index = 0; index < 24; ++index) {
    estimate = 0.5 * (estimate + value/estimate);
  }

  return estimate;
}

static double inox_math_reduce_radians(double value) {
  const double pi = 3.14159265358979323846;
  const double tau = 6.28318530717958647692;

  while (value > pi) {
    value -= tau;
  }

  while (value < -pi) {
    value += tau;
  }

  return value;
}

double inox_math_sin(double value) {
  double x = inox_math_reduce_radians(value);
  double x2 = x * x;
  return x * (1 - x2/6 + (x2 * x2)/120 - (x2 * x2 * x2)/5040 + (x2 * x2 * x2 * x2)/362880);
}

double inox_math_cos(double value) {
  double x = inox_math_reduce_radians(value);
  double x2 = x * x;
  return 1 - x2/2 + (x2 * x2)/24 - (x2 * x2 * x2)/720 + (x2 * x2 * x2 * x2)/40320;
}

static int inox_math_os_random_bytes(uint8_t* out, size_t len) {
  if (out == 0 && len != 0) return 0;
#if defined(_WIN32) && defined(_MSC_VER)
  size_t filled = 0;

  while (filled < len) {
    unsigned int value = 0;
    if (rand_s(&value) != 0) return 0;

    for (size_t index = 0; index < sizeof(value) && filled < len; ++index) {
      out[filled] = (uint8_t)(value >> (index * 8));
      filled += 1;
    }
  }

  return 1;
#elif defined(_WIN32)
  (void)out;
  (void)len;
  return 0;
#elif defined(__APPLE__) || defined(__FreeBSD__) || defined(__OpenBSD__) || defined(__NetBSD__) || defined(__DragonFly__)
  arc4random_buf(out, len);
  return 1;
#else
  size_t filled = 0;
#if defined(__linux__)
  while (filled < len) {
    ssize_t count = getrandom(out + filled, len - filled, 0);
    if (count <= 0) break;
    filled += (size_t)count;
  }

  if (filled == len) return 1;
#endif
  int fd = open("/dev/urandom", O_RDONLY);
  if (fd < 0) return 0;

  while (filled < len) {
    ssize_t count = read(fd, out + filled, len - filled);

    if (count <= 0) {
      close(fd);
      return 0;
    }

    filled += (size_t)count;
  }

  close(fd);
  return 1;
#endif
}

static double inox_math_simple_random(void) {
  inox_math_random_state = inox_math_random_state * 1664525u + 1013904223u;
  return (double)(inox_math_random_state >> 8) / 16777216.0;
}

static double inox_math_xorshift32_random(void) {
  if (inox_math_random_state == 0u) inox_math_random_state = 0x6d2b79f5u;

  uint32_t value = inox_math_random_state;
  value ^= value << 13;
  value ^= value >> 17;
  value ^= value << 5;
  inox_math_random_state = value;
  return (double)(value >> 8) / 16777216.0;
}

double inox_math_random(void) {
  if (inox_math_random_current_backend == INOX_MATH_RANDOM_XORSHIFT32) {
    return inox_math_xorshift32_random();
  }

  if (inox_math_random_current_backend == INOX_MATH_RANDOM_OS) {
    uint32_t value = 0;

    if (inox_math_os_random_bytes((uint8_t*)&value, sizeof(value))) {
      return (double)(value >> 8) / 16777216.0;
    }
  }

  return inox_math_simple_random();
}
