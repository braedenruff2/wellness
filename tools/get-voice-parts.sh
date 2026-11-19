#!/usr/bin/env bash
# Fetches what the APK build needs for Loudbook's voice engine (as Loudbook's tools/ci-parts.sh): sherpa-onnx's Android
# libraries and Kokoro's small files (tokens, English dictionary, espeak-ng data). PARTS=/home/claude/parts by default.
set -euo pipefail
PARTS=${PARTS:-/home/claude/parts}; SV=v1.13.8
mkdir -p "$PARTS/dl"; cd "$PARTS"
get() { [ -s "dl/$2" ] || curl -fsSL --retry 5 -o "dl/$2" "$1"; }
get "https://github.com/k2-fsa/sherpa-onnx/releases/download/$SV/sherpa-onnx-$SV-android.tar.bz2" sherpa.tar.bz2
get "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-multi-lang-v1_0.tar.bz2" kokoro.tar.bz2
tar xjf dl/sherpa.tar.bz2 ./jniLibs/arm64-v8a/libsherpa-onnx-jni.so ./jniLibs/arm64-v8a/libonnxruntime.so
[ -e kokoro-multi-lang-v1_0/tokens.txt ] || tar xjf dl/kokoro.tar.bz2
ls -la jniLibs/arm64-v8a kokoro-multi-lang-v1_0/tokens.txt
