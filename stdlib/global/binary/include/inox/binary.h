#ifndef INOX_BINARY_H
#define INOX_BINARY_H

#include <cstddef>
#include <cstdint>
#include <initializer_list>
#include <span>

#include "inox/string.h"
#include "inox/value.h"

class Buffer;
class BufferConstants;

class Uint8Array : public inox::Value {
public:
  class Reference {
  public:
    Reference& operator=(double value);
    operator double() const;

  private:
    Uint8Array* owner_;
    double index_;

    Reference(Uint8Array* owner, double index);

    friend class Uint8Array;
  };

  Uint8Array();
  explicit Uint8Array(double length);
  Uint8Array(std::initializer_list<double> values);
  explicit Uint8Array(std::span<const std::uint8_t> values);
  explicit Uint8Array(const inox::Value& value);
  explicit Uint8Array(inox::Value&& value);

  bool valid() const;
  std::size_t length() const;
  std::span<const std::uint8_t> bytes() const;
  std::span<std::uint8_t> bytes();
  Reference operator[](double index);
  double operator[](double index) const;
  Uint8Array slice(double start) const;
  Uint8Array slice(double start, double end) const;
  inox::String toString() const;

private:
  static Uint8Array allocate(double length, bool buffer);
  static Uint8Array copy(std::span<const std::uint8_t> values, bool buffer);
  static std::size_t maximumLength();
  Uint8Array view(double start, double end, bool buffer) const;
  bool isBufferValue() const;
  double read(double index) const;
  void write(double index, double value);

  friend class Buffer;
  friend class BufferConstants;
};

#endif
