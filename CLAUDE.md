# Working rules for this repository

These are the owner's standing instructions for every change, by anyone working on this code:

Thoroughly review and scrutinise all code. Identify and troubleshoot every bug, error, edge case and potential failure. Verify that all features work as intended, fix the underlying issues, and prioritise the clearest, simplest and most reliable solutions. Do not overlook existing functionality or introduce regressions. Test all changes before considering the work complete.

In practice:
- Run `npm test` (unit tests) and `npx tsc --noEmit` before every commit.
- For anything visible in the app, build (`npm run build`), start `npx vite preview --port 4173`, and run the browser checks in `tests/e2e/*.cjs` that cover the change; add one when no check covers it. Look at the result in a screenshot, not only at computed values.
- Keep README.md and TODO.md up to date with what changed and what is verified.
