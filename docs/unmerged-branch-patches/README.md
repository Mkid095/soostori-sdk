# Unmerged SDK branch patches

Four local branches carry work that was never merged into `main` and was
never pushed to the remote. These patches preserve it.

| Branch | Commits | Content |
|---|---|---|
| `p18-sdk` | 2 | Phase 18 partner/salesperson/influencer commission contracts, Conversion records, ApprovalStatus, idempotency |
| `worktree-phase2-sdk` | 3 | GAP-14/15 — TeamService revoke+resend, SubscriptionWarning; version bumps; PHASE-02 audit report |
| `worktree-phase1-audit` | 1 | PHASE-01 auth audit evidence report |
| `worktree-phase3-sdk` | 1 | Phase 03A training/meeting lifecycle contract — already on the remote, so no patch needed |

**To recover work from a patch:**

    git checkout main
    git apply --check docs/unmerged-branch-patches/<branch>.patch

Review each before applying — these are historical branches, not staged
work. The commission contracts in particular may conflict with current
`main`.
