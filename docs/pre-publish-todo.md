# Pre-Publish TODO

## Tier 1: Fix Before Launch

- [x] Verify API keys were never committed to git history; rotate if so
- [x] Sanitize API error messages — return generic user-friendly messages, log real errors server-side
- [x] Use `crypto.timingSafeEqual()` for auth checks in cron/admin endpoints
- [x] Add in-memory rate limiting to `/api/share` POST endpoint
- [x] Remove unused `wavesurfer.js` dependency

## Tier 2: High Impact Polish

- [ ] Add first-visit onboarding overlay (describe > generate > play)
- [ ] Add empty state messaging to pad grid
- [ ] Lazy-load ChatPanel and its dependencies (react-markdown, remark-gfm, AI SDK)
- [ ] Migrate ScriptProcessor to AudioWorklet (bitcrusher, loop chop)
- [ ] Surface errors from silent catch blocks (toast/notification or at minimum console.error)

## Tier 3: Worth Doing But Won't Block Launch

- [ ] Add React.memo() to pad grid, effect knobs, mixer strips
- [ ] Cache distortion curve and impulse response generation by parameter value
- [ ] Add useCallback() for frequently-created inline handlers
- [ ] Parse/modify/serialize JSON in share.ts instead of string replacement
- [ ] Add keyboard support to Knob component
- [ ] Add :focus-visible styling to all interactive elements
- [ ] Verify color contrast for LCD theme colors (WCAG AA)
- [ ] Add focus trapping to chat panel
- [ ] Add "best on desktop" note for mobile visitors
- [ ] Lazy-load JSZip (only needed for kit export)

## Tier 4: Post-Launch

- [ ] Replace Framer Motion with CSS transitions
- [ ] Extract App.tsx into smaller components
- [ ] Consolidate useState hooks into useReducer
- [ ] Add Content Security Policy headers
- [ ] Implement persistent rate limiting (Redis/KV)
