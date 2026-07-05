#ifndef INOX_MATH_H
#define INOX_MATH_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum inox_math_random_backend {
  INOX_MATH_RANDOM_SIMPLE = 0,
  INOX_MATH_RANDOM_XORSHIFT32 = 1,
  INOX_MATH_RANDOM_OS = 2
} inox_math_random_backend;

void inox_math_configure_random(uint32_t seed, inox_math_random_backend backend);
double inox_math_abs(double value);
double inox_math_floor(double value);
double inox_math_ceil(double value);
double inox_math_round(double value);
double inox_math_trunc(double value);
double inox_math_fround(double value);
double inox_math_min(double left, double right);
double inox_math_max(double left, double right);
double inox_math_sqrt(double value);
double inox_math_sin(double value);
double inox_math_cos(double value);
double inox_math_random(void);

#ifdef __cplusplus
}
#endif

#ifdef __cplusplus

class Math {
public:
  double abs(double value) const {
    return inox_math_abs(value);
  }

  double floor(double value) const {
    return inox_math_floor(value);
  }

  double ceil(double value) const {
    return inox_math_ceil(value);
  }

  double round(double value) const {
    return inox_math_round(value);
  }

  double trunc(double value) const {
    return inox_math_trunc(value);
  }

  double fround(double value) const {
    return inox_math_fround(value);
  }

  double min(double left, double right) const {
    return inox_math_min(left, right);
  }

  double max(double left, double right) const {
    return inox_math_max(left, right);
  }

  double sqrt(double value) const {
    return inox_math_sqrt(value);
  }

  double sin(double value) const {
    return inox_math_sin(value);
  }

  double cos(double value) const {
    return inox_math_cos(value);
  }

  double random() const {
    return inox_math_random();
  }
};

inline Math Math;

#endif

#endif
