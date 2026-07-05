#if defined(_WIN32) && defined(_MSC_VER)
#define _CRT_RAND_S
#endif

#include "inox/math.h"

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

void Math::init(uint32_t seed) const {
  init(seed, MathRandomBackend::Simple);
}

void Math::init(uint32_t seed, MathRandomBackend backend) const {
  random_state_ = seed;
  random_backend_ = backend;
}

double Math::abs(double value) const {
  return value < 0 ? -value : value;
}

double Math::floor(double value) const {
  long long truncated = (long long)value;
  return (double)truncated > value ? (double)(truncated - 1) : (double)truncated;
}

double Math::ceil(double value) const {
  long long truncated = (long long)value;
  return (double)truncated < value ? (double)(truncated + 1) : (double)truncated;
}

double Math::round(double value) const {
  return floor(value + 0.5);
}

double Math::trunc(double value) const {
  return (double)((long long)value);
}

double Math::fround(double value) const {
  return (double)((float)value);
}

double Math::min(double left, double right) const {
  return left < right ? left : right;
}

double Math::max(double left, double right) const {
  return left > right ? left : right;
}

double Math::sqrt(double value) const {
  if (value < 0) return 0.0/0.0;
  if (value == 0) return 0;

  double estimate = value < 1 ? 1 : value;

  for (int index = 0; index < 24; ++index) {
    estimate = 0.5 * (estimate + value/estimate);
  }

  return estimate;
}

double Math::sin(double value) const {
  double x = reduce_radians(value);
  double x2 = x * x;

  return x * (
    1 -
    x2/6 +
    (x2 * x2)/120 -
    (x2 * x2 * x2)/5040 +
    (x2 * x2 * x2 * x2)/362880
  );
}

double Math::cos(double value) const {
  double x = reduce_radians(value);
  double x2 = x * x;

  return
    1 -
    x2/2 +
    (x2 * x2)/24 -
    (x2 * x2 * x2)/720 +
    (x2 * x2 * x2 * x2)/40320;
}

double Math::random() const {
  if (random_backend_ == MathRandomBackend::Xorshift32) {
    return xorshift32_random();
  }

  if (random_backend_ == MathRandomBackend::Os) {
    uint32_t value = 0;

    if (os_random_bytes((uint8_t*)&value, sizeof(value))) {
      return (double)(value >> 8) / 16777216.0;
    }
  }

  return simple_random();
}

double Math::reduce_radians(double value) const {
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

int Math::os_random_bytes(uint8_t* out, size_t len) const {
  if (out == nullptr && len != 0) return 0;
#if defined(_WIN32) && defined(_MSC_VER)
  size_t filled = 0;

  while (filled < len) {
    unsigned int value = 0;
    if (rand_s(&value) != 0) return 0;

    for (size_t index = 0; index < sizeof(value) && filled < len; ++index) {
      out[filled] = (uint8_t)(value >> (index * 8));
      ++filled;
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

double Math::simple_random() const {
  random_state_ = random_state_ * 1664525u + 1013904223u;
  return (double)(random_state_ >> 8) / 16777216.0;
}

double Math::xorshift32_random() const {
  if (random_state_ == 0u) random_state_ = 0x6d2b79f5u;

  uint32_t value = random_state_;
  value ^= value << 13;
  value ^= value >> 17;
  value ^= value << 5;
  random_state_ = value;
  return (double)(value >> 8) / 16777216.0;
}
