create table public.bookspark_course_completion (
  user_id uuid not null references auth.users(id) on delete cascade,
  course_slug text not null,
  lesson_completed_at timestamptz not null default now(),
  certificate_id uuid unique,
  certificate_name text,
  issued_at timestamptz,
  primary key (user_id, course_slug),
  check (certificate_name is null or char_length(certificate_name) between 2 and 100),
  check ((certificate_id is null and certificate_name is null and issued_at is null) or
         (certificate_id is not null and certificate_name is not null and issued_at is not null))
);
alter table public.bookspark_course_completion enable row level security;
revoke all on public.bookspark_course_completion from anon, authenticated;
