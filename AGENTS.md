<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture
- All app data flows through `src/lib/store.tsx` (in-memory, shaped like the planned Supabase tables in `src/lib/types.ts`); swap its internals for Supabase queries/Realtime when the user connects their own project — components only use the store hooks.
- All AI agent calls go through `src/lib/agentClient.ts` (mocked); the real agent service replaces it.
- Credit/pricing rules live in `src/lib/credits.ts` and are covered by `src/test/credits.test.ts`.
- App screens live under the pathless `src/routes/_app/` layout (AppShell); `/site/$slug` stands in for generated company websites shown in the HQ frame.
