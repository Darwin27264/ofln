#!/usr/bin/env python3
"""
Generate all app icon assets for Android and iOS from a 1024x1024 source icon.
"""

import os
import sys
from PIL import Image, ImageDraw

def make_round_icon(img: Image.Image, size: int) -> Image.Image:
    """Create a circular masked RGBA icon with 4x supersampled antialiasing."""
    scale = 4
    high_size = size * scale
    high_mask = Image.new('L', (high_size, high_size), 0)
    draw = ImageDraw.Draw(high_mask)
    draw.ellipse((0, 0, high_size - 1, high_size - 1), fill=255)
    
    # Downsample mask with high quality
    mask = high_mask.resize((size, size), Image.Resampling.LANCZOS)
    
    # Resize base image
    base = img.resize((size, size), Image.Resampling.LANCZOS).convert('RGBA')
    base.putalpha(mask)
    return base

def main():
    if len(sys.argv) > 1:
        source_path = sys.argv[1]
    else:
        source_path = 'icon.png'

    print(f"Reading source icon from: {source_path}")
    source = Image.open(source_path).convert('RGBA')
    if source.size != (1024, 1024):
        print(f"Resizing source from {source.size} to (1024, 1024)...")
        source = source.resize((1024, 1024), Image.Resampling.LANCZOS)

    # Save to root icon.png
    root_icon = 'icon.png'
    source.save(root_icon, format='PNG', optimize=True)
    print(f"Updated {root_icon}")

    # Android mipmap configurations
    # density: (launcher_size, foreground_size)
    android_densities = {
        'mipmap-mdpi': (48, 108),
        'mipmap-hdpi': (72, 162),
        'mipmap-xhdpi': (96, 216),
        'mipmap-xxhdpi': (144, 324),
        'mipmap-xxxhdpi': (192, 432),
    }

    res_dir = os.path.join('android', 'app', 'src', 'main', 'res')
    for folder, (ic_size, fg_size) in android_densities.items():
        folder_path = os.path.join(res_dir, folder)
        os.makedirs(folder_path, exist_ok=True)

        # 1. ic_launcher.webp
        ic_img = source.resize((ic_size, ic_size), Image.Resampling.LANCZOS).convert('RGB')
        ic_path = os.path.join(folder_path, 'ic_launcher.webp')
        ic_img.save(ic_path, format='WEBP', quality=95, method=6)

        # 2. ic_launcher_round.webp (circular mask)
        rd_img = make_round_icon(source, ic_size)
        rd_path = os.path.join(folder_path, 'ic_launcher_round.webp')
        rd_img.save(rd_path, format='WEBP', quality=95, method=6)

        # 3. ic_launcher_foreground.webp
        fg_img = source.resize((fg_size, fg_size), Image.Resampling.LANCZOS).convert('RGB')
        fg_path = os.path.join(folder_path, 'ic_launcher_foreground.webp')
        fg_img.save(fg_path, format='WEBP', quality=95, method=6)

        print(f"Generated Android {folder}: ic={ic_size}x{ic_size}, round={ic_size}x{ic_size}, fg={fg_size}x{fg_size}")

    # iOS AppIcon configurations
    ios_icons = [
        ('icon-20@1x.png', 20),
        ('icon-20@2x-ipad.png', 40),
        ('icon-20@2x.png', 40),
        ('icon-20@3x.png', 60),
        ('icon-29@1x.png', 29),
        ('icon-29@2x-ipad.png', 58),
        ('icon-29@2x.png', 58),
        ('icon-29@3x.png', 87),
        ('icon-40@1x.png', 40),
        ('icon-40@2x-ipad.png', 80),
        ('icon-40@2x.png', 80),
        ('icon-40@3x.png', 120),
        ('icon-60@2x.png', 120),
        ('icon-60@3x.png', 180),
        ('icon-76@1x.png', 76),
        ('icon-76@2x.png', 152),
        ('icon-83.5@2x.png', 167),
        ('icon-1024.png', 1024),
    ]

    ios_dir = os.path.join('ios', 'ofln', 'Images.xcassets', 'AppIcon.appiconset')
    os.makedirs(ios_dir, exist_ok=True)
    for filename, size in ios_icons:
        img_out = source.resize((size, size), Image.Resampling.LANCZOS).convert('RGB')
        out_path = os.path.join(ios_dir, filename)
        img_out.save(out_path, format='PNG', optimize=True)
        print(f"Generated iOS {filename} ({size}x{size})")

    print("\nAll Android and iOS icon assets generated successfully!")

if __name__ == '__main__':
    main()
