#!/usr/bin/env bash
# Builds dist/Wellness.apk without Gradle: aapt2 -> javac -> d8 -> zip -> zipalign -> apksigner.
#   BT=/path/to/build-tools/35.x ANDROID_JAR=/path/to/android.jar bash tools/build-apk.sh
# The signing key is android/faith.keystore (made once; keep it, or updates won't install over the old app).
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD
: "${BT:?set BT to an Android build-tools folder (aapt2, zipalign, lib/d8.jar, lib/apksigner.jar)}"
: "${ANDROID_JAR:?set ANDROID_JAR to platforms/android-35/android.jar}"
OUT=$ROOT/build
CODE=${FC_CODE:-$(( 30000000 + ($(date -u +%s) - 1767225600) / 60 ))}  # minutes since 2026-01-01, always above the first build (26111815)
NAME=${FC_NAME:-0.1.$(date -u +%Y%m%d.%H%M)}
KS=${FC_KEYSTORE:-$ROOT/android/faith.keystore}   # cloud runs: FC_KEYSTORE=<the copy from his private Drive folder>
# Loudbook's voice engine (sherpa-onnx) and Kokoro's small files: PARTS from tools/get-voice-parts.sh
PARTS=${PARTS:-/home/claude/parts}
ABI=${ABI:-arm64-v8a}
JNI=$PARTS/jniLibs/$ABI
KOKORO=$PARTS/kokoro-multi-lang-v1_0
for need in "$JNI/libsherpa-onnx-jni.so" "$JNI/libonnxruntime.so" "$KOKORO/tokens.txt" "$KOKORO/lexicon-us-en.txt" "$KOKORO/espeak-ng-data" voices/mms-tgl/tokens.txt; do
  [ -e "$need" ] || { echo "missing: $need (run tools/get-voice-parts.sh)"; exit 1; }
done
PASS=faithcompanion   # a personal sideload key, not a secret

node modules/faith/tools/build-content.cjs --check
node modules/tagalog/tools/build-packs.cjs --check
rm -rf "$OUT"; mkdir -p "$OUT"/{gen,classes,dex,stage/assets}
echo "- resources ($NAME, code $CODE)"
"$BT/aapt2" compile --dir android/res -o "$OUT/res.zip"
"$BT/aapt2" link -I "$ANDROID_JAR" --manifest android/AndroidManifest.xml --java "$OUT/gen" \
  -o "$OUT/base.apk" "$OUT/res.zip" --version-code "$CODE" --version-name "$NAME" --replace-version
echo "- java"
find android/src "$OUT/gen" -name '*.java' > "$OUT/sources.txt"
javac -nowarn -Xlint:-options -encoding UTF-8 -source 8 -target 8 \
  -bootclasspath "$ANDROID_JAR:$BT/core-lambda-stubs.jar" -classpath "$ANDROID_JAR" -d "$OUT/classes" @"$OUT/sources.txt"
echo "- dex"
java -cp "$BT/lib/d8.jar" com.android.tools.r8.D8 --release --min-api 26 --lib "$ANDROID_JAR" \
  --output "$OUT/dex" $(find "$OUT/classes" -name '*.class')
echo "- package"
cp "$OUT/base.apk" "$OUT/unsigned.apk"
cp "$OUT/dex/classes.dex" "$OUT/stage/"
cp -r app/www "$OUT/stage/assets/www"
mkdir -p "$OUT/stage/assets/kokoro" "$OUT/stage/assets/mms-tgl" "$OUT/stage/lib/$ABI"
cp "$KOKORO/tokens.txt" "$KOKORO/lexicon-us-en.txt" "$OUT/stage/assets/kokoro/"
cp -r "$KOKORO/espeak-ng-data" "$OUT/stage/assets/kokoro/"
cp voices/mms-tgl/tokens.txt "$OUT/stage/assets/mms-tgl/"
cp "$JNI/libsherpa-onnx-jni.so" "$JNI/libonnxruntime.so" "$OUT/stage/lib/$ABI/"
( cd "$OUT/stage" && zip -q "$OUT/unsigned.apk" classes.dex && zip -q -r "$OUT/unsigned.apk" assets
  # native code stored uncompressed so Android can load it in place
  zip -q -0 "$OUT/unsigned.apk" lib/$ABI/*.so )
"$BT/zipalign" -P 16 -f 4 "$OUT/unsigned.apk" "$OUT/aligned.apk" 2>/dev/null || "$BT/zipalign" -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
if [ ! -e "$KS" ]; then
  # A new key would make an app that can't install over his (Android refuses a different signature): only on purpose.
  [ "${FC_NEW_KEY:-}" = 1 ] || { echo "missing signing key $KS (cloud: download faith.keystore from the private Drive folder; FC_NEW_KEY=1 makes a new one)"; exit 1; }
  keytool -genkeypair -keystore "$KS" -storepass "$PASS" -keypass "$PASS" -alias faith -keyalg RSA -keysize 2048 \
    -validity 20000 -dname "CN=Faith Companion" >/dev/null
fi
mkdir -p dist
java -jar "$BT/lib/apksigner.jar" sign --ks "$KS" --ks-pass pass:$PASS --key-pass pass:$PASS --out dist/Wellness.apk "$OUT/aligned.apk"
java -jar "$BT/lib/apksigner.jar" verify dist/Wellness.apk
echo "$NAME" > dist/version.txt
# what the app's updater reads (on the PC through the PC link, or from GitHub)
printf '{"code": %s, "name": "%s", "size": %s}\n' "$CODE" "$NAME" "$(stat -c %s dist/Wellness.apk)" > dist/version.json
ls -la dist/Wellness.apk
