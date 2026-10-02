INCLUDE PERFETTO MODULE android.startup.startups;
INCLUDE PERFETTO MODULE android.app_process_starts;
WITH app_slices AS (
  SELECT s.*, t.tid, p.pid, t.tid=p.pid AS main_thread
  FROM slice s JOIN thread_track tt ON s.track_id=tt.id
  JOIN thread t USING(utid) JOIN process p USING(upid)
  WHERE p.name='ru.timacad.platform'
), launch AS (
  SELECT * FROM android_startups WHERE package='ru.timacad.platform'
)
SELECT json_object(
  'startup', json((SELECT json_group_array(json_object('ts_ns',ts,'duration_ms',dur/1e6,'type',startup_type)) FROM launch)),
  'process_start', json((SELECT json_group_array(json_object('pid',pid,'startProc_ms',proc_start_dur/1e6,'bindApplication_ms',bind_app_dur/1e6,'intent_ms',intent_dur/1e6,'process_module_total_ms',total_dur/1e6)) FROM android_app_process_starts WHERE process_name='ru.timacad.platform')),
  'app_spans', json((SELECT json_group_array(json_object('name',name,'ts_ns',ts,'duration_ms',dur/1e6,'main_thread',main_thread)) FROM (SELECT * FROM app_slices WHERE name GLOB 'TimStartup:*' ORDER BY ts))),
  'framework_main', json((SELECT json_group_array(json_object('name',s.name,'after_launch_ms',(s.ts-l.ts)/1e6,'duration_ms',s.dur/1e6,'depth',s.depth)) FROM app_slices s JOIN launch l WHERE s.main_thread AND s.ts BETWEEN l.ts AND l.ts_end AND (s.name IN ('PostFork','ZygoteInit','ActivityThreadMain','bindApplication','Startup','ProfileInstallerInitializer','activityStart','activityResume') OR (s.name GLOB 'Choreographer#doFrame*' AND s.depth=1)))),
  'health_issues', json((SELECT json_group_array(json_object('name',name,'value',value,'severity',severity)) FROM stats WHERE value>0 AND (severity='error' OR name='trace_sorter_negative_timestamp_dropped')))
) AS summary;
