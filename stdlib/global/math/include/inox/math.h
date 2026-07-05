#ifndef INOX_MATH_H
#define INOX_MATH_H

#include <stddef.h>
#include <stdint.h>

enum class MathRandomBackend {
  Simple,
  Xorshift32,
  Os
};

class Math {
public:
  void init(uint32_t seed) const;
  void init(uint32_t seed, MathRandomBackend backend) const;

  double abs(double value) const;
  double floor(double value) const;
  double ceil(double value) const;
  double round(double value) const;
  double trunc(double value) const;
  double fround(double value) const;
  double min(double left, double right) const;
  double max(double left, double right) const;
  double sqrt(double value) const;
  double sin(double value) const;
  double cos(double value) const;
  double random() const;

private:
  mutable uint32_t random_state_ = 0x6d2b79f5u;
  mutable MathRandomBackend random_backend_ = MathRandomBackend::Simple;

  double reduce_radians(double value) const;
  int os_random_bytes(uint8_t* out, size_t len) const;
  double simple_random() const;
  double xorshift32_random() const;
};

inline Math Math;

#endif
