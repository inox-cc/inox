#ifndef INOX_CONVERSIONS_H
#define INOX_CONVERSIONS_H

#include "inox/value.h"

#ifdef __cplusplus

bool Boolean(bool value);
bool Boolean(double value);
bool Boolean(const inox::Value& value);

#endif

#endif
