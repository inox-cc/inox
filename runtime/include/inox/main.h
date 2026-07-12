#ifndef INOX_MAIN_H
#define INOX_MAIN_H

#ifdef __cplusplus

namespace inox {

using AppMain = void (*)(void);

int run_app(AppMain app_main);
int main(AppMain app_main);

} // namespace inox

#endif

#endif
