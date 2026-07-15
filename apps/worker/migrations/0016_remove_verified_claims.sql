UPDATE briefing_editions
SET title = CASE title
  WHEN 'Verified updates' THEN 'Updates'
  WHEN 'تحديثات موثوقة' THEN 'التحديثات'
  WHEN 'Mises à jour vérifiées' THEN 'Mises à jour'
  ELSE title
END
WHERE title IN ('Verified updates', 'تحديثات موثوقة', 'Mises à jour vérifiées');

UPDATE briefing_editions
SET summary = 'Reported updates:' || substr(summary, length('Verified updates:') + 1)
WHERE summary LIKE 'Verified updates:%';

UPDATE briefing_editions
SET summary = 'أبرز ما ورد:' || substr(summary, length('تحديثات موثوقة:') + 1)
WHERE summary LIKE 'تحديثات موثوقة:%';

UPDATE briefing_editions
SET summary = 'À retenir :' || substr(summary, length('Mises à jour vérifiées :') + 1)
WHERE summary LIKE 'Mises à jour vérifiées :%';
