create policy repos_delete_own
  on repos for delete
  using (auth.uid() = user_id);
