create trigger on_weekly_plan_created
  after insert on public.weekly_plans
  for each row execute procedure public.handle_new_weekly_plan();
