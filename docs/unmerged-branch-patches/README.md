# Unmerged SDK branch patches

Four local branches carried commits that were never merged into `main` and
were never pushed to the remote. The branches were deleted during the
2026-10-13 worktree cleanup; the work is preserved here as `git
format-patch` mailboxes containing source changes only (build artifacts
and `.tgz` tarballs were excluded).

| Branch | Commits | Content |
|---|---|---|
| `p18-sdk.mbox` | 2 | Phase 18 partner/salesperson/influencer commission contracts — Conversion records, ApprovalStatus, idempotency |
| `worktree-phase2-sdk.mbox` | 3 | GAP-14/15 — TeamService revoke+resend, SubscriptionWarning; version bumps |
| `worktree-phase1-audit.mbox` | 1 | PHASE-01 auth audit evidence report |

`worktree-phase3-sdk` already existed on the remote, so it needed no
preservation.

## Recovering

```bash
git am --3way docs/unmerged-branch-patches/<branch>.mbox
```

`git am` may conflict — these branches predate current `main` and the
commission contracts in `p18-sdk` touch the same contracts packages that
have changed since. Review before applying:

```bash
git am --show-current-patch=diff   # inspect while resolving
```

Nothing here is staged work. These are historical branches preserved so
the content is not lost; decide per-commit whether it still applies.