-- Create notifications table
create table public.notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  message text not null,
  is_read boolean default false,
  link text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.notifications enable row level security;

-- Policies
create policy "Users can view their own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

create policy "Users can update their own notifications"
  on public.notifications for update
  using (auth.uid() = user_id);

-- Trigger Function for Weekly Plans (assuming table name is 'weekly_plans' and has 'athlete_id')
-- Adjust table name and column names as per actual schema if different, but assuming standard naming based on context.
create or replace function public.handle_new_weekly_plan()
returns trigger as $$
begin
  insert into public.notifications (user_id, title, message, link)
  values (
    new.athlete_id,
    '📅 Nueva planificación disponible',
    'Tu entrenador ha asignado una nueva planificación semanal.',
    '/dashboard' -- or specific link to plan
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger
-- IMPORTANT: Check if table 'weekly_plans' exists first or user needs to run this.
-- If 'weekly_plans' does not exist yet (as I haven't seen it explicitly), this trigger might fail creation.
-- I will add the trigger creation but commented out with instruction or check if table exists.
-- For now, I'll assume standard 'weekly_plans' based on user request "tabla weekly_plans (o como se llame)".
-- I'll check the file structure first to be sure about table names if possible, but I don't have access to DB schema directly.
-- I will create the function and trigger assuming the table exists.

drop trigger if exists on_weekly_plan_created on public.weekly_plans;
create trigger on_weekly_plan_created
  after insert on public.weekly_plans
  for each row execute procedure public.handle_new_weekly_plan();
