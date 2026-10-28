-- OOTD share hardening, scheduled cleanup
-- Date: 2026-09-21
--
-- Applied. jobid 1, active.
--
-- The RLS policy in part 1 makes an expired link stop resolving the moment it
-- expires. This job is the second half: it removes the data for real.
--
-- Runs 03:17 UTC daily. cleanup_expired_shares() deletes, for every expired
-- token: the storage.objects rows for its photos, its suggestions, and the
-- shared_closets row.

create extension if not exists pg_cron;

select cron.unschedule('ootd-cleanup-expired-shares')
where exists (select 1 from cron.job where jobname = 'ootd-cleanup-expired-shares');

select cron.schedule(
  'ootd-cleanup-expired-shares',
  '17 3 * * *',
  $job$ select public.cleanup_expired_shares(); $job$
);

-- ---------------------------------------------------------------------------
-- Known limit, stated rather than hidden:
--
-- Deleting the storage.objects row makes the public URL return 404, so the
-- photo stops being reachable. It does not delete the underlying file from
-- S3, because that needs the Storage API rather than SQL. The bytes linger
-- and still count toward your 1 GB storage quota.
--
-- Privacy is protected. Storage cost is not reclaimed. To reclaim it, the
-- cleanup has to move into an Edge Function that calls the Storage API, which
-- needs pg_net and a function deployment.
-- ---------------------------------------------------------------------------

-- Check on it later with:
--   select * from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname = 'ootd-cleanup-expired-shares')
--    order by start_time desc limit 10;
