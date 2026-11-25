-- SurveyPass: database notes for the future multi-client (real login) version.
-- Not deployed anywhere yet. Kept outside public/ so it is never served.

-- Leadership "Team" panel: lists staff, whether they have signed in, and when.
-- Only active admins who have set their password may call it.
create or replace function public.team_status()
returns table(user_id uuid, full_name text, username text, role text, depts text[], active boolean, set_password boolean, last_sign_in timestamptz)
language sql stable security definer set search_path = public, auth as $$
  select s.user_id, s.full_name, s.username, s.role, s.depts, s.active, not s.must_change_password, u.last_sign_in_at
  from public.staff s join auth.users u on u.id = s.user_id
  where exists (select 1 from public.staff me where me.user_id = auth.uid() and me.active
                and not me.must_change_password and me.role = 'admin')
  order by case s.role when 'director' then 0 when 'admin' then 1 else 2 end, s.full_name
$$;
revoke all on function public.team_status() from public, anon, authenticated;
grant execute on function public.team_status() to authenticated;
