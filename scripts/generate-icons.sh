#!/bin/bash

# Icon generation script using rsvg-convert
# Source SVG file
SVG_FILE="icons/icon.svg"

# Check if rsvg-convert is available
if ! command -v rsvg-convert &> /dev/null; then
    echo "Error: rsvg-convert not found. Install it with: brew install librsvg"
    exit 1
fi

# Check if magick (ImageMagick) is available
if ! command -v magick &> /dev/null; then
    echo "Error: magick not found. Install it with: brew install imagemagick"
    exit 1
fi

# Check if source SVG exists
if [ ! -f "$SVG_FILE" ]; then
    echo "Error: Source SVG file not found: $SVG_FILE"
    exit 1
fi

# Generate icon with padding (10% margin)
# Usage: generate_with_padding <size> <output_file>
generate_with_padding() {
    local size=$1
    local output=$2
    local inner_size=$((size * 100 / 100))
    rsvg-convert -w $inner_size -h $inner_size "$SVG_FILE" | \
        magick - -gravity center -background transparent -extent ${size}x${size} "$output"
}

echo "Generating icons..."

# ============================================
# Browser Extension Icons (no padding)
# ============================================
echo "-> Browser extension icons..."
rsvg-convert -w 16 -h 16 "$SVG_FILE" -o icons/icon16.png
rsvg-convert -w 48 -h 48 "$SVG_FILE" -o icons/icon48.png
rsvg-convert -w 128 -h 128 "$SVG_FILE" -o icons/icon128.png

# ============================================
# Android App Icons (mipmap) - with padding
# ============================================
echo "-> Android app icons..."
# mdpi: 48x48, hdpi: 72x72, xhdpi: 96x96, xxhdpi: 144x144, xxxhdpi: 192x192
generate_with_padding 48 mobile/android/app/src/main/res/mipmap-mdpi/ic_launcher.png
generate_with_padding 72 mobile/android/app/src/main/res/mipmap-hdpi/ic_launcher.png
generate_with_padding 96 mobile/android/app/src/main/res/mipmap-xhdpi/ic_launcher.png
generate_with_padding 144 mobile/android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png
generate_with_padding 192 mobile/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png

# ============================================
# Android Adaptive Icon Foreground (drawable) - with padding
# ============================================
echo "-> Android adaptive icon foreground..."
# Foreground needs to be larger (108dp base, with safe zone)
# mdpi: 108x108, hdpi: 162x162, xhdpi: 216x216, xxhdpi: 324x324, xxxhdpi: 432x432
generate_with_padding 108 mobile/android/app/src/main/res/drawable-mdpi/ic_launcher_foreground.png
generate_with_padding 162 mobile/android/app/src/main/res/drawable-hdpi/ic_launcher_foreground.png
generate_with_padding 216 mobile/android/app/src/main/res/drawable-xhdpi/ic_launcher_foreground.png
generate_with_padding 324 mobile/android/app/src/main/res/drawable-xxhdpi/ic_launcher_foreground.png
generate_with_padding 432 mobile/android/app/src/main/res/drawable-xxxhdpi/ic_launcher_foreground.png

# ============================================
# iOS App Icons - with padding
# ============================================
echo "-> iOS app icons..."
IOS_ICON_DIR="mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset"
generate_with_padding 20 "$IOS_ICON_DIR/Icon-App-20x20@1x.png"
generate_with_padding 40 "$IOS_ICON_DIR/Icon-App-20x20@2x.png"
generate_with_padding 60 "$IOS_ICON_DIR/Icon-App-20x20@3x.png"
generate_with_padding 29 "$IOS_ICON_DIR/Icon-App-29x29@1x.png"
generate_with_padding 58 "$IOS_ICON_DIR/Icon-App-29x29@2x.png"
generate_with_padding 87 "$IOS_ICON_DIR/Icon-App-29x29@3x.png"
generate_with_padding 40 "$IOS_ICON_DIR/Icon-App-40x40@1x.png"
generate_with_padding 80 "$IOS_ICON_DIR/Icon-App-40x40@2x.png"
generate_with_padding 120 "$IOS_ICON_DIR/Icon-App-40x40@3x.png"
generate_with_padding 50 "$IOS_ICON_DIR/Icon-App-50x50@1x.png"
generate_with_padding 100 "$IOS_ICON_DIR/Icon-App-50x50@2x.png"
generate_with_padding 57 "$IOS_ICON_DIR/Icon-App-57x57@1x.png"
generate_with_padding 114 "$IOS_ICON_DIR/Icon-App-57x57@2x.png"
generate_with_padding 120 "$IOS_ICON_DIR/Icon-App-60x60@2x.png"
generate_with_padding 180 "$IOS_ICON_DIR/Icon-App-60x60@3x.png"
generate_with_padding 72 "$IOS_ICON_DIR/Icon-App-72x72@1x.png"
generate_with_padding 144 "$IOS_ICON_DIR/Icon-App-72x72@2x.png"
generate_with_padding 76 "$IOS_ICON_DIR/Icon-App-76x76@1x.png"
generate_with_padding 152 "$IOS_ICON_DIR/Icon-App-76x76@2x.png"
generate_with_padding 167 "$IOS_ICON_DIR/Icon-App-83.5x83.5@2x.png"
generate_with_padding 1024 "$IOS_ICON_DIR/Icon-App-1024x1024@1x.png"

# ============================================
# macOS App Icons - with padding
# ============================================
echo "-> macOS app icons..."
MACOS_ICON_DIR="mobile/macos/Runner/Assets.xcassets/AppIcon.appiconset"
generate_with_padding 16 "$MACOS_ICON_DIR/app_icon_16.png"
generate_with_padding 32 "$MACOS_ICON_DIR/app_icon_32.png"
generate_with_padding 64 "$MACOS_ICON_DIR/app_icon_64.png"
generate_with_padding 128 "$MACOS_ICON_DIR/app_icon_128.png"
generate_with_padding 256 "$MACOS_ICON_DIR/app_icon_256.png"
generate_with_padding 512 "$MACOS_ICON_DIR/app_icon_512.png"
generate_with_padding 1024 "$MACOS_ICON_DIR/app_icon_1024.png"

echo "Done! All icons generated successfully."
