#ifndef INOX_MATH_H
#define INOX_MATH_H

#include <stddef.h>
#include <stdint.h>

enum class MathRandomBackend {
  Auto,
  Simple,
  Xorshift32,
  Os
};

class MathObject final {
public:
  static constexpr double E = 2.71828182845904523536;
  static constexpr double PI = 3.14159265358979323846;

  MathObject(uint32_t seed, bool seed_configured, MathRandomBackend backend);

  double abs(double value) const;
  double acos(double value) const;
  double asin(double value) const;
  double atan(double value) const;
  double atan2(double y, double x) const;
  double cbrt(double value) const;
  double floor(double value) const;
  double ceil(double value) const;
  double round(double value) const;
  double trunc(double value) const;
  double fround(double value) const;
  double exp(double value) const;
  double hypot() const;
  double hypot(double value) const;
  double hypot(double left, double right) const;
  double hypot(const double* values, size_t count) const;
  double log(double value) const;
  double log10(double value) const;
  double log2(double value) const;
  double min() const;
  double min(double value) const;
  double min(double left, double right) const;
  double min(const double* values, size_t count) const;
  double max() const;
  double max(double value) const;
  double max(double left, double right) const;
  double max(const double* values, size_t count) const;
  double pow(double base, double exponent) const;
  double sign(double value) const;
  double sqrt(double value) const;
  double sin(double value) const;
  double cos(double value) const;
  double tan(double value) const;
  double random() const;

private:
  mutable uint32_t random_state_;
  mutable MathRandomBackend random_backend_;
};

extern MathObject Math;

#endif
