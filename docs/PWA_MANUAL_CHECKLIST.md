# PWA manual follow-up checklist

Automated local production-like checks cover manifest, icons, service-worker registration/scope/controller, start URL unauthenticated redirect, direct route reload, and Chromium 390x844 smoke. The following device-only checks were not run and must not be treated as passed:

- [ ] Add to Home Screen on a real iPhone.
- [ ] Launch in standalone mode from the Home Screen.
- [ ] Verify Login/Register input focus does not trigger unwanted auto-zoom.
- [ ] Verify safe-area insets and Bottom Navigation placement.
- [ ] Verify notification permission prompt behavior.
- [ ] Verify push reception on a real supported device/browser.
- [ ] Verify notification tap deep-link behavior in standalone mode.
