# Changelog

house-style's versions, newest first. Each section is the upgrade note for a
repo moving to that version: what changed, and what to fix before syncing it.
Tags are `house-style-v<version>`.

## 1.0.0 (2026-11-11)

The first version. A repo adopting it takes the reformat commit, the configs
and the pins below in one go (the `house-style` skill has the steps).

- **ESLint** (`houseStyle(options)`): `@eslint/js` and `typescript-eslint`
  recommended; `_`-prefixed unused names; the six typed rules through
  `projectService` (`no-floating-promises` with `node:test`'s `describe`, `it`
  and `test` as known-safe calls, `no-misused-promises`, `await-thenable`,
  `switch-exhaustiveness-check` with `considerDefaultExhaustiveForUnions`,
  `no-unnecessary-type-assertion`, `consistent-type-imports`); `react-hooks`
  recommended on `web`; `better-tailwindcss/no-unknown-classes` and
  `no-deprecated-classes` on `web` with `tailwind`, and
  `enforce-consistent-class-order` with `tailwind.order`; `n/no-process-env`
  outside `config.ts`, tests, tool configs (`*.config.*`) and scripts (not the
  `console` globs: a CLI may print, but reads its settings through `config.ts`);
  `@vitest/eslint-plugin` recommended on tests, with `valid-expect`'s
  `maxArgs: 2` and without `no-conditional-expect` (the house asserts inside a
  `catch`); and the house shapes as errors: no `enum`, no
  `any`, no `!` (a warning in tests), `@ts-expect-error` with a description
  only, no `TODO` or `FIXME` comment, no `console` outside scripts and CLIs, and
  no default export outside configs and the `defaultExports` globs.
- **Prettier**: width 120, `trailingComma: "all"`, Prettier's defaults
  otherwise.
- **TypeScript**: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`,
  `isolatedModules`, `noUnusedLocals`, `noFallthroughCasesInSwitch`, `NodeNext`,
  `verbatimModuleSyntax`, `erasableSyntaxOnly`, `target` ES2023 and
  `skipLibCheck`.
- **knip** and **dependency-cruiser** presets.
- **The sync**, `bin/sync.mjs`.
- **The convention checkers**, run by `check:conventions`:
  `bin/check-base-ui.mjs` (the `base-ui` skill's rules 1, 2, 3, 5, 6 and 11 as
  errors, 9 and 10 as warnings; `--version` sets the Base UI pin, 1.9.0 by
  default) and `bin/check-structure.mjs` (the `code-structure` skill's rules 1,
  2, 3 and 6 as errors, 11 as a warning; 5 and 7 are the dependency-cruiser
  preset's). Both take `--warn-only`, print `file:line rule-N severity: message`,
  exit 1 on an error left and 2 when they can't check.
- **The `base-ui` skill's numbers** (2026-11-11, brief 02): the skill has 17
  rules, so a `conventions.json` exception may name base-ui rules 1 to 17
  (14 to 17, like 4, 7, 8, 12 and 13, are review's, recorded rather than
  checked). Rule 9 no longer warns when a trigger's first child is a part of
  its own component, such as `<Select.Value>` in `<Select.Trigger>`: that is
  the component's anatomy, not a wrapped control.
- **`conventions.json`**, read by both checkers from the repo root, `scripts/`
  or `tools/`: the `web`, `server` and `shared` roots, the `ui` folders, the
  one `stylesheet`, and `exceptions`, each with its check, rule, path and a
  required reason. `conventions.schema.json` describes it for editors.
- **Pins**: ESLint 10.9.1, `@eslint/js` 10.0.1, `typescript-eslint` 8.72.2,
  TypeScript 6.0.3, `eslint-plugin-react-hooks` 7.1.1,
  `eslint-plugin-better-tailwindcss` 4.10.0, `eslint-plugin-n` 18.5.0,
  `@vitest/eslint-plugin` 1.6.28, `eslint-plugin-import-x` 4.18.1, Prettier
  3.9.10, knip 6.44.2, dependency-cruiser 18.7.2.
- **Node**: `^22.13.0 || ^24.0.0 || >=26.0.0`, where every pinned tool runs.
- **Folded in after the proof run on Wicket (2026-11-11)**:
  - `.cjs` files get CommonJS globals (`module`, `require`) through a
    `house-style/commonjs-globals` block, so the `.dependency-cruiser.cjs` the
    house prescribes passes `no-undef`. A repo's own block for this is
    redundant.
  - The README and the adoption reference say where scripts go: a folder of
    scripts run by hand goes in the `scripts` option; a CLI inside the app goes
    in `console`, and its environment reads move into `config.ts`.
  - The knip sample: in a repo with npm workspaces the repo's entries go under
    `workspaces: { ".": { entry } }`, and a package folder that isn't a
    workspace goes in `ignore`.
  - The tsconfig example carries the Docker caveat: a Dockerfile stage that
    copies only the repo's `tsconfig.base.json` can't extend the vendored file.
  - `check:fast` is `npm run typecheck && node scripts/check-fast.mjs`, because
    `tsc -b` misses web type errors when the web project sits outside its graph.
  - The reformat's acceptance is the bundle compare (CSS through esbuild's `css`
    loader, JSON compared parsed, every difference listed), not `git diff -w`;
    the expected difference is JSX text split with `{" "}`.
  - A temporary exception's comment says what removes it, never a brief number.
  - `no-circular` and a feature's context type: a route importing a type from
    `app.ts` is a cycle, so the harness lowers `no-circular` to `warn` by name
    until the server brief gives each feature its own options type.
- **Known:** `npm audit` reports moderate advisories for `minimatch` inside
  ESLint and typescript-eslint. Both are development tools only, and npm's one
  offered fix is a downgrade to ESLint 9, so they stay until ESLint 10's own
  dependencies move.
