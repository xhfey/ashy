# Roulette Game Assets

This folder should contain the following image assets for the roulette wheel:

## Required Files

| File | Dimensions | Description |
|------|------------|-------------|
| `wheel-background.png` | 550x550 | Base layer with mascot/background design |
| `wheel-frame.png` | 550x550 | Outer ember ring overlay (transparent center) |
| `wheel-center.png` | 140x140 | Demonic cat emblem for wheel center |
| `pointer.png` | 80x50 | Golden arrow pointer, positioned on RIGHT side |

## Design Guidelines

### Color Palette
The game uses a dark/gold/ember theme:
- Brass/Bronze: `#C98350`
- Deep Crimson: `#8B2942`
- Hot Pink/Magenta: `#D86075`
- Royal Violet: `#413A86`
- Dark Forest Emerald: `#2D4A3E`
- Ember Orange: `#D48D56`
- Text: Silver/White `#ECECED`

### Layer Order (bottom to top)
1. `wheel-background.png` - base background
2. Generated wheel segments with player names
3. `wheel-frame.png` - outer decorative ring
4. `wheel-center.png` - center emblem
5. `pointer.png` - arrow pointing at selected segment

### Notes
- All images should have transparent backgrounds where appropriate
- The wheel-frame should have a transparent center to show the wheel segments
- The pointer should point LEFT (it will be positioned on the right side of the wheel)
- Use high contrast for text readability

## Fallback Behavior
If assets are not found, the game will use simple colored fallbacks:
- Dark background (`#1a1a2e`)
- Simple circle for center
- Triangle pointer in gold
