#ifndef INOX_TIMERS_PROMISES_H
#define INOX_TIMERS_PROMISES_H

#include "inox/promise.h"

class TimersPromisesModule {
public:
  inox::Promise setTimeout() const;
  inox::Promise setTimeout(double delay) const;
  inox::Promise setTimeout(double delay, inox::Value value) const;
  inox::Promise setImmediate() const;
  inox::Promise setImmediate(inox::Value value) const;
};

extern const TimersPromisesModule timersPromises;

#endif
