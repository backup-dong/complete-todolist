# Dong Todo Icon Design

## Date
2026-07-11

## Goal
Create a new app icon for Dong Todo that:
- Combines the letter "D" with a todo/check element
- Feels polished, minimal, and easy to understand at small sizes
- Uses the existing brand blue `#2563EB`
- Has a rounded-square silhouette for PWA/mobile compatibility
- Outputs: Pencil source file, PWA icons (192×192 / 512×512), browser favicon, desktop app icon

## Direction chosen
**Concept C — Task Stack**

A rounded-square blue icon with a white "D" stem on the left and two overlapping white task cards on the right. Each card shows a checked box and a task line, so the icon communicates both "Dong Todo" and "task list" at a glance.

## Visual design

### Background
- Rounded square, 256×256 px (designed at 2× the final 128×128 grid)
- Corner radius: 56 px
- Fill: linear gradient from `#2563EB` (top-left) to `#1D4ED8` (bottom-right), 135° rotation

### "D" structure
- Left stem: white rounded rectangle, 24×160 px, 12 px corner radius
- The right side of the D is formed by two stacked white task cards instead of a solid bowl, making the todo metaphor the central feature

### Task cards
- Both cards: 112×76 px, 16 px corner radius, white fill
- Back card: positioned at (88, 48)
- Front card: positioned at (88, 104), slightly overlapping the back card
- Outer drop shadow on each card for subtle depth
  - Back card: `0 4 12 rgba(0,0,0,0.12)`
  - Front card: `0 4 12 rgba(0,0,0,0.16)`

### Card contents
- Checkbox: 18×18 px rounded square, `#2563EB` fill, 5 px corner radius
- Checkmark: white 2.5 px stroke with round caps/joins
- Task line: light-blue pill (`#93C5FD`), 10 px height, rounded ends

### Sizes to export
- 16×16 (favicon)
- 32×32 (favicon @2x / retina)
- 180×180 (Apple touch icon)
- 192×192 (PWA icon)
- 512×512 (PWA splash/maskable source)
- 1024×1024 (desktop app / store source)

## Files to update
- `public/icon-192.png` — replace with the 192×192 export
- `public/icon-512.png` — replace with the 512×512 export
- Add `public/favicon.ico` or `public/favicon.svg` for browser tab
- Add `public/apple-touch-icon.png` (optional)
- Save source as `design/dong-todo-icon.pen`

## Notes
- Keep the icon flat and minimal; no heavy 3D or excessive gradients
- Ensure the checkmark and task lines remain readable at 32×32
- The rounded-square shape guarantees it works as a PWA maskable icon
