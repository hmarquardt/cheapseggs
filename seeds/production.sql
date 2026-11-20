-- Idempotent reviewed public editorial samples; no identities, credentials or intimate responses.
INSERT OR IGNORE INTO categories(id,title) VALUES ('connection','Good chemistry');
INSERT OR IGNORE INTO activities(id) VALUES ('playlist'),('compliments'),('slow-dance');
INSERT OR IGNORE INTO activity_versions
  (activity_id,version,title,description,category_id,heat,experimentation,energy,duration_minutes,metadata_json,status,public_preview)
VALUES
  ('playlist',1,'Set the soundtrack','Pick one song each and make a tiny soundtrack for the evening.','connection',0,0,0,5,
   '{"tags":["atmosphere"],"environments":["home","hotel","getaway","private-other"],"supplies":[],"preparation":[],"accessibility":["Lyrics or a quiet shared pause work too."],"safetyFlags":[],"requiredOptIns":[],"incompatibleWith":[],"phases":["setup"]}','published',1),
  ('compliments',1,'Compliments, on the house','Take turns sharing something you appreciate about each other. Passing is always welcome.','connection',0,0,0,5,
   '{"tags":["conversation"],"environments":["home","hotel","getaway","private-other"],"supplies":[],"preparation":[],"accessibility":["Say it, write it, or sign it."],"safetyFlags":[],"requiredOptIns":[],"incompatibleWith":[],"phases":["warm-up","reconnect"]}','published',1),
  ('slow-dance',1,'The living-room slow dance','Choose a song and invite a dance. Seated movement or simply listening together works beautifully.','connection',0,0,1,5,
   '{"tags":["music"],"environments":["home","hotel","getaway","private-other"],"supplies":[],"preparation":["Clear a comfortable space."],"accessibility":["Seated movement or listening together."],"safetyFlags":["Ask before touch."],"requiredOptIns":[],"incompatibleWith":[],"phases":["main"]}','published',1);
INSERT OR IGNORE INTO wheels(id,version,title,selection_policy,status)
VALUES ('chemistry-preview',1,'Good Chemistry','uniform','draft');
INSERT OR IGNORE INTO wheel_segments(wheel_id,wheel_version,activity_id,activity_version)
VALUES ('chemistry-preview',1,'playlist',1),('chemistry-preview',1,'compliments',1),('chemistry-preview',1,'slow-dance',1);
