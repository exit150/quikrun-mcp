# Changesets

Managed by [changesets](https://github.com/changesets/changesets).

To record a change for release: `npx changeset` — pick the bump (patch/minor/major)
and write a one-line summary, then commit it. When the PR merges, a bot opens a
"Version Packages" PR; merging that publishes the new version to npm.
