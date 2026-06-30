cmake_minimum_required(VERSION 3.20)

project(inox_http_server C CXX)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(INOX_REPO_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../..")
set(INOX_LOOP_BACKEND "libuv" CACHE STRING "inox C runtime event loop backend")
set_property(CACHE INOX_LOOP_BACKEND PROPERTY STRINGS libuv)

set(INOX_COMPILER_MODE "node" CACHE STRING "inox compiler runner")
set_property(CACHE INOX_COMPILER_MODE PROPERTY STRINGS node native)
set(INOX_NODE_COMPILER "${INOX_REPO_ROOT}/compiler/index.ts" CACHE FILEPATH "inox hosted compiler")
set(INOX_NATIVE_COMPILER "${INOX_REPO_ROOT}/dist/inox" CACHE FILEPATH "inox native compiler")
set(INOX_ENTRY "${CMAKE_CURRENT_SOURCE_DIR}/index.ts")
set(INOX_GENERATED_DIR "${CMAKE_CURRENT_BINARY_DIR}/generated")
set(INOX_GENERATED_CC "${INOX_GENERATED_DIR}/index.cc")
set(INOX_OUTPUT_DIR "${INOX_REPO_ROOT}/dist/http-server/out")
set(INOX_STATIC_SOURCE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/public")
set(INOX_STATIC_OUTPUT_DIR "${INOX_OUTPUT_DIR}/static")
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY "${INOX_OUTPUT_DIR}")

if(INOX_COMPILER_MODE STREQUAL "native")
  if(NOT EXISTS "${INOX_NATIVE_COMPILER}")
    message(FATAL_ERROR "dist/inox was not found. Run pnpm run build first.")
  endif()

  set(INOX_COMPILER_COMMAND "${INOX_NATIVE_COMPILER}")
  set(INOX_COMPILER_DEPENDENCY "${INOX_NATIVE_COMPILER}")
elseif(INOX_COMPILER_MODE STREQUAL "node")
  find_program(NODE_EXECUTABLE node REQUIRED)

  if(NOT EXISTS "${INOX_NODE_COMPILER}")
    message(FATAL_ERROR "compiler/index.ts was not found.")
  endif()

  set(INOX_COMPILER_COMMAND "${NODE_EXECUTABLE}" "${INOX_NODE_COMPILER}")
  set(INOX_COMPILER_DEPENDENCY "${INOX_NODE_COMPILER}")
else()
  message(FATAL_ERROR "INOX_COMPILER_MODE must be node or native.")
endif()

foreach(config DEBUG RELEASE RELWITHDEBINFO MINSIZEREL)
  set(CMAKE_RUNTIME_OUTPUT_DIRECTORY_${config} "${INOX_OUTPUT_DIR}")
endforeach()

add_subdirectory("${INOX_REPO_ROOT}/runtime" "${CMAKE_CURRENT_BINARY_DIR}/inox_runtime")

file(GLOB_RECURSE INOX_COMPILER_SOURCES CONFIGURE_DEPENDS
  "${INOX_REPO_ROOT}/compiler/*.ts"
  "${INOX_REPO_ROOT}/stdlib/*.ts"
)

file(GLOB_RECURSE INOX_STATIC_SOURCES CONFIGURE_DEPENDS
  "${INOX_STATIC_SOURCE_DIR}/*"
)

add_custom_command(
  OUTPUT "${INOX_GENERATED_CC}"
  COMMAND ${INOX_COMPILER_COMMAND} "${INOX_ENTRY}" --emit cc --loop-backend "${INOX_LOOP_BACKEND}" -o "${INOX_GENERATED_CC}"
  MAIN_DEPENDENCY "${INOX_ENTRY}"
  DEPENDS "${INOX_ENTRY}" ${INOX_COMPILER_SOURCES} "${INOX_COMPILER_DEPENDENCY}"
  WORKING_DIRECTORY "${INOX_REPO_ROOT}"
  VERBATIM
)

add_custom_target(inox_http_server_static_assets ALL
  COMMAND "${CMAKE_COMMAND}" -E rm -rf "${INOX_STATIC_OUTPUT_DIR}"
  COMMAND "${CMAKE_COMMAND}" -E make_directory "${INOX_STATIC_OUTPUT_DIR}"
  COMMAND "${CMAKE_COMMAND}" -E copy_directory "${INOX_STATIC_SOURCE_DIR}" "${INOX_STATIC_OUTPUT_DIR}"
  DEPENDS ${INOX_STATIC_SOURCES}
  VERBATIM
)

add_executable(http-server "${INOX_GENERATED_CC}")
add_dependencies(http-server inox_http_server_static_assets)
target_link_libraries(http-server PRIVATE inox_runtime)
set_property(TARGET http-server PROPERTY LINKER_LANGUAGE CXX)
