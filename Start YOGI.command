#!/bin/sh
ROOT=$(CDPATH= cd "$(dirname "$0")" && pwd -P)
exec sh "$ROOT/bootstrap-unix.sh" "$@"
