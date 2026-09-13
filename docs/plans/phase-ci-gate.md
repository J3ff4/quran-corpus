# Phase CI — automated test/lint gate (issue #1)

**Goal:** every test, lint and type gate in the repo runs on GitHub Actions for
each PR and each push to `main`, so a reviewer reads a check run instead of
trusting prose (CLAUDE.md §14, §10).

**Architecture:** one workflow, two independent jobs — `node` (turbo across the
JS workspace) and `python` (scraper). No matrix, no reusable workflows, no
remote turbo cache. Nothing in CI touches a DB: `packages/data` generates its
schema from `schema.sql`, and no test opens `quran.db`.

**Tech:** GitHub-hosted `ubuntu-latest`, `pnpm/action-setup`,
`actions/setup-node`, `astral-sh/setup-uv`.

## Global constraints

- No new runtime dependency (§12). Actions are CI config, not deps.
- `quran.db`, `hanswehr.sqlite` and every `*.db` stay out of git (§9, `.gitignore:34`).
- Workflow must not need a self-hosted runner or a secret.
- Style-only commits carry no logic change; `ruff format` output is not hand-edited.

## Measured baseline (2026-09-13, `main` @ `d0ea910`)

| gate | result | time |
|---|---|---|
| `turbo test lint type-check --force` | 12/12 green | 86s |
| `pytest -q` (scraper) | 825 passed | 27s |
| `mypy scraper` | clean, 47 files | — |
| `ruff check .` | **13 errors** (12 E501, 1 E741, 1 E702) | — |
| `ruff format --check .` | **28 files** would reformat | — |

Node dev env: v24.18.0, pnpm 10.34.3. Python: `requires-python >=3.12`.

## Rulings (owner, 2026-09-13)

1. ruff: fix the 13 errors by hand, then run `ruff format` as its own style-only
   commit. Gate both `check` and `format --check`.
2. Runner: GitHub-hosted. Owner sets branch protection by hand after the first
   green run (agent has no Settings access).
3. Hans Wehr differential gate (`tools/hanswehr_baseline`): **local-only**. It
   needs `~/quran-data/`, outside the repo. Documented, not faked with a fixture.
4. Playwright E2E smoke (§10) does not exist. Out of scope — a gate cannot run
   a test nobody wrote. Stays owed.

## Tasks

### Task 1 — scraper lint errors green

**Files:** `packages/scraper/scraper/sources/corpus_parser.py:24`,
`scraper/sources/qul.py:1`, `tests/test_db.py:294`,
`tests/test_review_glosses.py:17,50,70`,
`tools/check_mushaf_layout.py:138,160,175,194,221`,
`tools/import_alqurancloud.py:78`, `tools/spike_form_lemma_alignment.py:27`.

- [ ] Wrap each long line at 88 cols; rename the `l` binding
      (`check_mushaf_layout.py:138`) to something readable; split the semicolon
      statement (`test_db.py:294`).
- [ ] `uv run --frozen ruff check .` → 0 errors.
- [ ] `uv run --frozen pytest -q` → still 825 passed (the edits touch a test file
      and a tool; a wrap must not change behaviour).
- [ ] Commit `style(scraper): fix the 13 ruff lint errors`.

**Accept:** ruff check exit 0, pytest still 825.

### Task 2 — scraper formatting green

- [ ] `uv run --frozen ruff format .` (28 files). Do not hand-edit the output.
- [ ] `uv run --frozen pytest -q` → 825 passed; `mypy scraper` clean.
- [ ] Commit `style(scraper): apply ruff format` — body names the file count and
      says no logic changed.

**Accept:** `ruff format --check .` exit 0, pytest still 825.

### Task 3 — the workflow

**Files:** create `.github/workflows/ci.yml`.

- [ ] `on: pull_request` + `push: branches: [main]`. `concurrency` keyed on ref,
      `cancel-in-progress: true`.
- [ ] `permissions: contents: read` (least privilege, §3 OWASP).
- [ ] Job `node`: checkout → `pnpm/action-setup` (version from `packageManager`)
      → `actions/setup-node` node 24, `cache: pnpm` →
      `pnpm install --frozen-lockfile` → `pnpm exec turbo test lint type-check`.
- [ ] Job `python` (`working-directory: packages/scraper`): checkout →
      `astral-sh/setup-uv` with cache → `uv run --frozen ruff check .` →
      `ruff format --check .` → `mypy scraper` → `pytest -q`.
- [ ] Pin every action to a major tag; no `@master`.
- [ ] Commit `ci: add the test/lint gate for the node workspace and the scraper`.

**Accept:** both jobs green on the PR's own run. A gate that has never run red
proves nothing — Task 4 covers that.

### Task 4 — mutation-check the gate (§4 step 4)

The gate is the new logic here, so it gets the same treatment as a parser.

- [ ] Push a throwaway commit that breaks one thing per job (a failing assert in
      a scraper test; a type error in `apps/web`). Confirm BOTH jobs go red and
      the PR check shows red.
- [ ] Revert that commit by re-editing (never `git checkout <file>` /
      `git restore` — see `never-git-stash-for-a-baseline`).
- [ ] Record in this file: run URLs for the red run and the green run.

**Accept:** a linked red run and a linked green run on the same PR.

### Task 5 — document + hand off

**Files:** `README.md` (a `## CI` section), this plan's verification log.

- [ ] README names the two jobs, what each covers, and states plainly that the
      Hans Wehr differential gate and the §10 device checklist are local-only,
      with their commands.
- [ ] Tell the owner the exact Settings path for branch protection on `main`:
      require the `node` and `python` checks, no force push.
- [ ] Commit `docs: describe the CI gate and what it does not cover`.

## Risks / rollback

- **pnpm 10 blocks build scripts.** If `pnpm install --frozen-lockfile` warns
  about ignored builds and a test then fails on a missing binary, add
  `onlyBuiltDependencies` to `pnpm-workspace.yaml` rather than `--no-frozen-lockfile`.
- **Node 24 vs LTS.** 24 is what the measured-green baseline ran on. If CI
  diverges, pin to the exact local minor before touching source.
- **`uv run --frozen`** fails loudly if `uv.lock` is stale — that is the intended
  behaviour, not a bug to work around.
- **Rollback:** delete `.github/workflows/ci.yml`. The two style commits stand on
  their own and do not need reverting.

## Verification log

**2026-09-13, PR #76, branch `ci/gate-workflow`.**

| run | head | node | python |
|---|---|---|---|
| [34785557744](https://github.com/J3ff4/quran-corpus/actions/runs/34785557744) | `43fe2c0` | **pass**, 2m07s | **pass**, 18s |
| [34786608056](https://github.com/J3ff4/quran-corpus/actions/runs/34786608056) | `a07cdbb` (deliberate break) | **fail** | **fail** |
| [see PR](https://github.com/J3ff4/quran-corpus/pull/76/checks) | revert | pass | pass |

Task 4 mutation-check: one failing assert appended to
`tests/test_buckwalter.py`, one type error appended to
`apps/web/src/lib/db.ts`. Both jobs went red, each for its own injected
reason -- not incidentally:

- `FAILED tests/test_buckwalter.py::test_ci_mutation_check - assert 1 == 2`
- `87:7 error 'ciMutationCheck' is assigned a value but never used`

The node job failed at `lint` before reaching `type-check`, so lint is proven
to gate and type-check is proven only by the local `--force` run. Turbo stops
the pipeline at the first red task by design; a second break placed past lint
would prove nothing the first did not.

Revert was byte-identical (restored from copies taken before the edit, never
`git checkout` -- see `never-git-stash-for-a-baseline`).

### One finding: CI runs three fewer tests than local

Local `pytest -q` reports **825 passed**; CI reports **822 passed, 3 skipped**.
The three are `@pytest.mark.skipif`-guarded on files outside the repo:
`test_hanswehr.py:110` (`hanswehr.sqlite`) and `test_hamza_seat_regression.py:35,47`
(the live `quran.db`). Same story on the node side: `m1-reader-db-contract.test.ts`
skips 3 of its 7 without a generated M1 DB.

This is the Ruling-3 boundary showing up as a number. It is recorded here
because "825 passed" in a PR body and "822 passed" in CI are both true, and a
future reader comparing them without this note would reasonably suspect the
gate of dropping tests.

## Owner hand-off

Branch protection is a Settings change the agent cannot make. On
`Settings > Branches > Add rule` for `main`: require status checks to pass,
select **`node (test, lint, type-check)`** and **`python (ruff, mypy, pytest)`**,
and require branches to be up to date before merging.
