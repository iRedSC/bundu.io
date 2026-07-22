# GitHub repository settings

CI files cannot enforce repository-level controls. Configure these once in GitHub.

## Branch protection for `main`

- Require a pull request before merging.
- Require branches to be up to date before merging.
- Require the `check`, `docker (frontend)`, `docker (server)`, `dependency-review`, and `codeql` status checks.
- `check` and `docker` run in parallel; both remain required so merges still wait on tests and image smoke.
- Block force pushes and branch deletion.
- Restrict direct pushes to maintainers or, for the strongest protection, disallow them.

Use a repository ruleset instead of classic branch protection when available. Rulesets make bypass permissions explicit and can be reviewed before activation.

## Code security

In **Settings → Advanced Security**, enable:

- Dependency graph and Dependabot alerts.
- Dependabot security updates.
- Secret scanning and push protection.

CodeQL is configured by `.github/workflows/security.yml`. Do not also enable CodeQL default setup; GitHub supports either default or advanced workflow setup, not both.

## Merge policy

- Enable automatic branch deletion after merge.
- Prefer squash merging so rapid-development pull requests remain easy to revert.
- Keep administrator bypass narrow; a required check that is routinely bypassed is not a useful control.
