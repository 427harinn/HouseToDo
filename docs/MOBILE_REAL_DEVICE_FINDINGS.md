# Mobile real-device findings

This note records the iPhone findings that motivated the mobile interaction fixes in this branch.

1. iOS zooms the viewport when a text field receives focus.
2. Page-wide horizontal movement can occur during scrolling.
3. Calendar month swipes can mix browser/page horizontal movement into the gesture.
4. Bottom Navigation moves vertically when the browser viewport or content scroll changes.
5. Calendar Date Sheet cannot always be dismissed with a downward swipe.
6. Pointer events can leak through to the background Calendar or footer after a Date Sheet gesture.
7. The Task form's `開始日`, `終日`, `日付`, and `時刻` controls overlap conceptually and are difficult to understand.
8. Multiple swipe action rows can be open at the same time.

## Manual iPhone verification checklist

Playwright can cover the gesture and layout contracts, but it cannot fully reproduce iOS keyboard zoom. Verify on a real iPhone before staging validation:

- [ ] Focusing a text input does not zoom the page.
- [ ] Button text remains at its intended visual size and is not globally enlarged.
- [ ] The focused input remains visible while the keyboard is open.
- [ ] Bottom Navigation does not move vertically while scrolling or opening the keyboard.
- [ ] The page cannot scroll sideways.
- [ ] Calendar left/right month swipes change month consistently.
- [ ] Calendar Date Sheet downward swipe dismisses the sheet.
- [ ] Date Sheet gestures never activate a background grid cell or footer control.
