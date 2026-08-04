#if defined(_WIN32) && defined(_MSC_VER)
#define _CRT_RAND_S
#endif

#include "inox/math.h"

#include <cmath>
#include <limits>

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

MathObject::MathObject(uint32_t seed, bool seed_configured, MathRandomBackend backend)
  : random_state_(seed),
    random_backend_(backend == MathRandomBackend::Auto
      ? (seed_configured ? MathRandomBackend::Simple : MathRandomBackend::Os)
      : backend) {}

static double math_simple_random(uint32_t* state) {
  *state = *state * 1664525u + 1013904223u;
  return (double)(*state >> 8) / 16777216.0;
}

static double math_xorshift32_random(uint32_t* state) {
  if (*state == 0u) *state = 0x6d2b79f5u;

  uint32_t value = *state;
  value ^= value << 13;
  value ^= value >> 17;
  value ^= value << 5;
  *state = value;
  return (double)(value >> 8) / 16777216.0;
}

static int math_os_random_bytes(uint8_t* out, size_t len) {
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

double MathObject::abs(double value) const {
  return std::fabs(value);
}

double MathObject::acos(double value) const {
  return std::acos(value);
}

double MathObject::asin(double value) const {
  return std::asin(value);
}

double MathObject::atan(double value) const {
  return std::atan(value);
}

double MathObject::atan2(double y, double x) const {
  return std::atan2(y, x);
}

double MathObject::cbrt(double value) const {
  return std::cbrt(value);
}

double MathObject::floor(double value) const {
  return std::floor(value);
}

double MathObject::ceil(double value) const {
  return std::ceil(value);
}

double MathObject::round(double value) const {
  if (!std::isfinite(value) || value == 0) {
    return value;
  }

  const double rounded = std::floor(value + 0.5);

  return rounded == 0 && value < 0 ? -0.0 : rounded;
}

double MathObject::trunc(double value) const {
  return std::trunc(value);
}

double MathObject::fround(double value) const {
  return static_cast<double>(static_cast<float>(value));
}

double MathObject::exp(double value) const {
  return std::exp(value);
}

double MathObject::hypot() const {
  return 0;
}

double MathObject::hypot(double value) const {
  return std::fabs(value);
}

double MathObject::hypot(double left, double right) const {
  return std::hypot(left, right);
}

double MathObject::hypot(const double* values, size_t count) const {
  double result = 0;

  for (size_t index = 0; index < count; index += 1) {
    result = std::hypot(result, values[index]);
  }

  return result;
}

double MathObject::log(double value) const {
  return std::log(value);
}

double MathObject::log10(double value) const {
  return std::log10(value);
}

double MathObject::log2(double value) const {
  return std::log2(value);
}

double MathObject::min() const {
  return std::numeric_limits<double>::infinity();
}

double MathObject::min(double value) const {
  return value;
}

double MathObject::min(double left, double right) const {
  if (std::isnan(left) || std::isnan(right)) {
    return std::numeric_limits<double>::quiet_NaN();
  }

  if (left == right) {
    return left == 0 && (std::signbit(left) || std::signbit(right)) ? -0.0 : left;
  }

  return left < right ? left : right;
}

double MathObject::min(const double* values, size_t count) const {
  double result = min();

  for (size_t index = 0; index < count; index += 1) {
    result = min(result, values[index]);
  }

  return result;
}

double MathObject::max() const {
  return -std::numeric_limits<double>::infinity();
}

double MathObject::max(double value) const {
  return value;
}

double MathObject::max(double left, double right) const {
  if (std::isnan(left) || std::isnan(right)) {
    return std::numeric_limits<double>::quiet_NaN();
  }

  if (left == right) {
    return left == 0 && (!std::signbit(left) || !std::signbit(right)) ? 0.0 : left;
  }

  return left > right ? left : right;
}

double MathObject::max(const double* values, size_t count) const {
  double result = max();

  for (size_t index = 0; index < count; index += 1) {
    result = max(result, values[index]);
  }

  return result;
}

double MathObject::pow(double base, double exponent) const {
  return std::pow(base, exponent);
}

double MathObject::sign(double value) const {
  if (std::isnan(value) || value == 0) {
    return value;
  }

  return value < 0 ? -1 : 1;
}

double MathObject::sqrt(double value) const {
  return std::sqrt(value);
}

double MathObject::sin(double value) const {
  return std::sin(value);
}

double MathObject::cos(double value) const {
  return std::cos(value);
}

double MathObject::tan(double value) const {
  return std::tan(value);
}

double MathObject::random() const {
  if (random_backend_ == MathRandomBackend::Xorshift32) {
    return math_xorshift32_random(&random_state_);
  }

  if (random_backend_ == MathRandomBackend::Os) {
    uint32_t value = 0;

    if (math_os_random_bytes((uint8_t*)&value, sizeof(value))) {
      return (double)(value >> 8) / 16777216.0;
    }
  }

  return math_simple_random(&random_state_);
}
