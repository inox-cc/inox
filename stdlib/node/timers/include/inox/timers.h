#ifndef INOX_TIMERS_H
#define INOX_TIMERS_H

#include "inox/callback.h"

class TimeoutHandle : public inox::Value {
public:
  TimeoutHandle();
  explicit TimeoutHandle(const inox::Value& value);
  explicit TimeoutHandle(inox::Value&& value);
  TimeoutHandle(const TimeoutHandle& other);
  TimeoutHandle(TimeoutHandle&& other) noexcept;
  TimeoutHandle& operator=(const TimeoutHandle& other);
  TimeoutHandle& operator=(TimeoutHandle&& other) noexcept;
  ~TimeoutHandle();

  TimeoutHandle ref() const;
  TimeoutHandle unref() const;
  bool hasRef() const;
};

class IntervalHandle : public inox::Value {
public:
  IntervalHandle();
  explicit IntervalHandle(const inox::Value& value);
  explicit IntervalHandle(inox::Value&& value);
  IntervalHandle(const IntervalHandle& other);
  IntervalHandle(IntervalHandle&& other) noexcept;
  IntervalHandle& operator=(const IntervalHandle& other);
  IntervalHandle& operator=(IntervalHandle&& other) noexcept;
  ~IntervalHandle();

  IntervalHandle ref() const;
  IntervalHandle unref() const;
  bool hasRef() const;
};

class ImmediateHandle : public inox::Value {
public:
  ImmediateHandle();
  explicit ImmediateHandle(const inox::Value& value);
  explicit ImmediateHandle(inox::Value&& value);
  ImmediateHandle(const ImmediateHandle& other);
  ImmediateHandle(ImmediateHandle&& other) noexcept;
  ImmediateHandle& operator=(const ImmediateHandle& other);
  ImmediateHandle& operator=(ImmediateHandle&& other) noexcept;
  ~ImmediateHandle();

  ImmediateHandle ref() const;
  ImmediateHandle unref() const;
  bool hasRef() const;
};

class TimersModule {
public:
  TimeoutHandle setTimeout(inox::Callback callback, double delay = 1) const;
  void clearTimeout(const TimeoutHandle& handle) const;
  IntervalHandle setInterval(inox::Callback callback, double delay = 1) const;
  void clearInterval(const IntervalHandle& handle) const;
  ImmediateHandle setImmediate(inox::Callback callback) const;
  void clearImmediate(const ImmediateHandle& handle) const;
};

extern const TimersModule timers;

#endif
