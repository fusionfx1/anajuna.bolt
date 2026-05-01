/*
  # RLS Contract — agent_decisions SELECT policy

  ## Problem with previous policy
  The original "Users can view own agent decisions" policy used:
      USING (auth.uid() = user_id)
  This silently drops all rows where user_id IS NULL — which is every row
  inserted by the Python backend (paper-trading / autonomous mode), because
  those sessions have no authenticated user and the service role key is used
  for INSERT.  The result: the Agent Feed renders an empty list for every
  authenticated user even though the table is populated.

  ## New policy
  "Authenticated users see own and shared agent decisions"
      USING (auth.uid() = user_id OR user_id IS NULL)

  Authenticated users can SELECT:
    - Rows they own  (auth.uid() = user_id)
    - Shared/system rows inserted by the service role with NULL user_id

  ## Realtime behaviour
  Supabase Realtime respects the SELECT RLS policy.  Because the new policy
  allows NULL-user_id rows, live INSERT events for those rows are forwarded to
  all authenticated subscribers on the `agent-decisions-feed` channel without
  needing an explicit Realtime filter.  No channel configuration change is
  required in the frontend hook.

  ## Security note
  NULL-user_id rows are considered "shared system decisions" — visible to any
  authenticated user.  Authenticated users still cannot INSERT rows with
  user_id IS NULL (the INSERT policy enforces auth.uid() = user_id).  Only the
  service role may insert NULL-user_id rows, preserving the audit trail
  integrity while allowing the frontend to display them.

  ## INSERT policies are unchanged
  - "Users can insert own agent decisions"  (TO authenticated, user_id = auth.uid())
  - "Service role can insert agent decisions" (TO service_role, WITH CHECK (true))
  - "Service role can read agent decisions"   (TO service_role, USING (true))
  These remain exactly as created in 20260430120000_create_agent_decisions.sql.

  ## No DELETE policy
  agent_decisions is append-only for audit integrity.
*/

-- ---------------------------------------------------------------------------
-- Drop the narrow SELECT policy that blocked NULL user_id rows
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can view own agent decisions"
  ON agent_decisions;

-- ---------------------------------------------------------------------------
-- Create the correct SELECT policy: own rows OR shared (user_id IS NULL)
-- ---------------------------------------------------------------------------

CREATE POLICY "Authenticated users see own and shared agent decisions"
  ON agent_decisions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL);
