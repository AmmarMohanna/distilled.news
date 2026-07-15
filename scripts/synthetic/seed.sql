PRAGMA foreign_keys = ON;

-- Twelve non-login canary accounts. These addresses cannot receive mail and the
-- password value is deliberately not a valid application password hash.
INSERT OR IGNORE INTO accounts (id, email, normalized_email, username, role, password_hash, email_verified_at, created_at, updated_at) VALUES
  ('account_canary_en_01', 'canary-en-01@example.invalid', 'canary-en-01@example.invalid', 'canary-en-01', 'user', 'synthetic-no-login', datetime('now'), datetime('now'), datetime('now')),
  ('account_canary_en_02', 'canary-en-02@example.invalid', 'canary-en-02@example.invalid', 'canary-en-02', 'user', 'synthetic-no-login', datetime('now'), datetime('now'), datetime('now')),
  ('account_canary_en_03', 'canary-en-03@example.invalid', 'canary-en-03@example.invalid', 'canary-en-03', 'user', 'synthetic-no-login', datetime('now'), datetime('now'), datetime('now')),
  ('account_canary_en_04', 'canary-en-04@example.invalid', 'canary-en-04@example.invalid', 'canary-en-04', 'user', 'synthetic-no-login', datetime('now'), datetime('now'), datetime('now')),
  ('account_canary_en_05', 'canary-en-05@example.invalid', 'canary-en-05@example.invalid', 'canary-en-05', 'user', 'synthetic-no-login', datetime('now'), datetime('now'), datetime('now')),
  ('account_canary_ar_01', 'canary-ar-01@example.invalid', 'canary-ar-01@example.invalid', 'canary-ar-01', 'user', 'synthetic-no-login', datetime('now'), datetime('now'), datetime('now')),
  ('account_canary_ar_02', 'canary-ar-02@example.invalid', 'canary-ar-02@example.invalid', 'canary-ar-02', 'user', 'synthetic-no-login', datetime('now'), datetime('now'), datetime('now')),
  ('account_canary_ar_03', 'canary-ar-03@example.invalid', 'canary-ar-03@example.invalid', 'canary-ar-03', 'user', 'synthetic-no-login', datetime('now'), datetime('now'), datetime('now')),
  ('account_canary_ar_04', 'canary-ar-04@example.invalid', 'canary-ar-04@example.invalid', 'canary-ar-04', 'user', 'synthetic-no-login', datetime('now'), datetime('now'), datetime('now')),
  ('account_canary_fr_01', 'canary-fr-01@example.invalid', 'canary-fr-01@example.invalid', 'canary-fr-01', 'user', 'synthetic-no-login', datetime('now'), datetime('now'), datetime('now')),
  ('account_canary_fr_02', 'canary-fr-02@example.invalid', 'canary-fr-02@example.invalid', 'canary-fr-02', 'user', 'synthetic-no-login', datetime('now'), datetime('now'), datetime('now')),
  ('account_canary_fr_03', 'canary-fr-03@example.invalid', 'canary-fr-03@example.invalid', 'canary-fr-03', 'user', 'synthetic-no-login', datetime('now'), datetime('now'), datetime('now'));

INSERT OR IGNORE INTO username_aliases (username, account_id, is_current, created_at)
SELECT username, id, 1, datetime('now') FROM accounts WHERE id LIKE 'account_canary_%';

-- Two public hourly feeds per account: 10 English, 8 Arabic, 6 French.
-- A $0.03 daily model budget per feed caps the full cohort at $0.72/day.
INSERT OR IGNORE INTO briefings (
  id, owner_account_id, slug, title, stars, interest_profile, style_instruction,
  public_feed_enabled, paused, language, retention_days, intensity, daily_budget_usd,
  briefing_cadence, briefing_time_of_day, briefing_timezone, next_briefing_at,
  created_at, updated_at
) VALUES
  ('briefing_canary_en_01_world', 'account_canary_en_01', 'world-briefing', '[Canary] World Briefing', 0, 'Major world events, diplomacy, elections, and decisions with concrete public impact.', 'Plain English. Exclude speculation and repeated headlines.', 1, 0, 'en', 15, 'low', 0.03, 'daily', '07:00', 'UTC', NULL, datetime('now'), datetime('now')),
  ('briefing_canary_en_01_middle_east', 'account_canary_en_01', 'middle-east-monitor', '[Canary] Middle East Monitor', 0, 'Security, diplomacy, economy, and public policy across the Middle East.', 'Plain English. State uncertainty and retain evidence.', 1, 0, 'en', 15, 'low', 0.03, 'daily', '13:00', 'UTC', NULL, datetime('now'), datetime('now')),
  ('briefing_canary_en_02_technology', 'account_canary_en_02', 'technology-watch', '[Canary] Technology Watch', 0, 'Important software, cybersecurity, product, and technology-company developments.', 'Concise English for a technical reader.', 1, 0, 'en', 15, 'low', 0.03, 'daily', '08:00', 'UTC', NULL, datetime('now'), datetime('now')),
  ('briefing_canary_en_02_startups', 'account_canary_en_02', 'startup-radar', '[Canary] Startup Radar', 0, 'Meaningful startup funding, shutdowns, acquisitions, and product launches.', 'Skip promotional claims without evidence.', 1, 0, 'en', 15, 'low', 0.03, 'daily', '15:00', 'UTC', NULL, datetime('now'), datetime('now')),
  ('briefing_canary_en_03_science', 'account_canary_en_03', 'science-frontier', '[Canary] Science Frontier', 0, 'Peer-reviewed science, major research results, and corrections.', 'Separate reported evidence from interpretation.', 1, 0, 'en', 15, 'low', 0.03, 'daily', '09:00', 'UTC', NULL, datetime('now'), datetime('now')),
  ('briefing_canary_en_03_health', 'account_canary_en_03', 'public-health', '[Canary] Public Health', 0, 'Public-health guidance, outbreaks, health policy, and high-quality medical evidence.', 'Avoid medical advice; report source claims precisely.', 1, 0, 'en', 15, 'low', 0.03, 'daily', '16:00', 'UTC', NULL, datetime('now'), datetime('now')),
  ('briefing_canary_en_04_ai', 'account_canary_en_04', 'ai-research', '[Canary] AI Research', 0, 'AI research, model releases, evaluations, safety, and regulation.', 'Use technically precise English and reject hype.', 1, 0, 'en', 15, 'low', 0.03, 'daily', '10:00', 'UTC', NULL, datetime('now'), datetime('now')),
  ('briefing_canary_en_04_climate', 'account_canary_en_04', 'climate-policy', '[Canary] Climate Policy', 0, 'Climate science, adaptation, clean energy, and enacted environmental policy.', 'Prioritize measured outcomes over announcements.', 1, 0, 'en', 15, 'low', 0.03, 'daily', '17:00', 'UTC', NULL, datetime('now'), datetime('now')),
  ('briefing_canary_en_05_energy', 'account_canary_en_05', 'energy-transition', '[Canary] Energy Transition', 0, 'Electricity, grids, renewables, batteries, oil, gas, and energy regulation.', 'Include concrete quantities when sources provide them.', 1, 0, 'en', 15, 'low', 0.03, 'daily', '11:00', 'UTC', NULL, datetime('now'), datetime('now')),
  ('briefing_canary_en_05_lebanon', 'account_canary_en_05', 'lebanon-economy', '[Canary] Lebanon Economy', 0, 'Lebanese economy, banking, infrastructure, energy, and decisions affecting daily life.', 'Use calm English and distinguish facts from political statements.', 1, 0, 'en', 15, 'low', 0.03, 'daily', '18:00', 'Asia/Beirut', NULL, datetime('now'), datetime('now')),

  ('briefing_canary_ar_01_world', 'account_canary_ar_01', 'world-arabic', '[اختبار] أخبار العالم', 0, 'أهم الأحداث العالمية والقرارات السياسية والاقتصادية ذات الأثر الملموس.', 'اكتب بالعربية الفصحى الواضحة وتجنب التكرار.', 1, 0, 'ar', 15, 'low', 0.03, 'daily', '07:30', 'UTC', NULL, datetime('now'), datetime('now')),
  ('briefing_canary_ar_01_middle_east', 'account_canary_ar_01', 'middle-east-arabic', '[اختبار] الشرق الأوسط', 0, 'الأمن والدبلوماسية والاقتصاد والسياسات العامة في الشرق الأوسط.', 'اذكر درجة اليقين واربط الخلاصة بالمصدر.', 1, 0, 'ar', 15, 'low', 0.03, 'daily', '13:30', 'UTC', NULL, datetime('now'), datetime('now')),
  ('briefing_canary_ar_02_lebanon', 'account_canary_ar_02', 'lebanon-now', '[اختبار] لبنان الآن', 0, 'الاقتصاد والطاقة والبنية التحتية والأمن والقرارات التي تؤثر في الحياة اليومية في لبنان.', 'لغة عربية هادئة ومباشرة من دون عبارات دعائية.', 1, 0, 'ar', 15, 'low', 0.03, 'daily', '08:30', 'Asia/Beirut', NULL, datetime('now'), datetime('now')),
  ('briefing_canary_ar_02_economy', 'account_canary_ar_02', 'arab-economy', '[اختبار] الاقتصاد العربي', 0, 'الاقتصاد والأسواق والسياسات المالية في الدول العربية.', 'ركز على القرارات والأرقام المؤكدة.', 1, 0, 'ar', 15, 'low', 0.03, 'daily', '14:30', 'UTC', NULL, datetime('now'), datetime('now')),
  ('briefing_canary_ar_03_ai', 'account_canary_ar_03', 'ai-arabic', '[اختبار] الذكاء الاصطناعي', 0, 'أبحاث الذكاء الاصطناعي وإطلاق النماذج والتقييمات والتنظيم.', 'استخدم مصطلحات تقنية عربية واضحة.', 1, 0, 'ar', 15, 'low', 0.03, 'daily', '09:30', 'UTC', NULL, datetime('now'), datetime('now')),
  ('briefing_canary_ar_03_science', 'account_canary_ar_03', 'science-arabic', '[اختبار] علوم وتقنية', 0, 'الأبحاث العلمية والتقنية والنتائج الجديدة المهمة.', 'ميز بين النتيجة العلمية والتفسير الصحفي.', 1, 0, 'ar', 15, 'low', 0.03, 'daily', '15:30', 'UTC', NULL, datetime('now'), datetime('now')),
  ('briefing_canary_ar_04_climate', 'account_canary_ar_04', 'climate-arabic', '[اختبار] الطاقة والمناخ', 0, 'علوم المناخ والطاقة النظيفة وسياسات البيئة في المنطقة والعالم.', 'لخص النتائج الملموسة والأرقام.', 1, 0, 'ar', 15, 'low', 0.03, 'daily', '10:30', 'UTC', NULL, datetime('now'), datetime('now')),
  ('briefing_canary_ar_04_health', 'account_canary_ar_04', 'health-arabic', '[اختبار] الصحة العامة', 0, 'الصحة العامة والسياسات الصحية والأدلة الطبية عالية الجودة.', 'لا تقدم نصائح طبية شخصية.', 1, 0, 'ar', 15, 'low', 0.03, 'daily', '16:30', 'UTC', NULL, datetime('now'), datetime('now')),

  ('briefing_canary_fr_01_world', 'account_canary_fr_01', 'monde', '[Canari] Le monde', 0, 'Événements mondiaux, diplomatie, élections et décisions ayant un effet concret.', 'Français clair, sobre et sans répétition.', 1, 0, 'fr', 15, 'low', 0.03, 'daily', '08:00', 'Europe/Paris', NULL, datetime('now'), datetime('now')),
  ('briefing_canary_fr_01_lebanon', 'account_canary_fr_01', 'liban', '[Canari] Le Liban', 0, 'Économie, énergie, infrastructure et décisions publiques au Liban.', 'Distinguer les faits des déclarations politiques.', 1, 0, 'fr', 15, 'low', 0.03, 'daily', '14:00', 'Europe/Paris', NULL, datetime('now'), datetime('now')),
  ('briefing_canary_fr_02_science', 'account_canary_fr_02', 'science', '[Canari] Science', 0, 'Recherche scientifique, résultats majeurs, corrections et santé publique.', 'Séparer les preuves de leur interprétation.', 1, 0, 'fr', 15, 'low', 0.03, 'daily', '09:00', 'Europe/Paris', NULL, datetime('now'), datetime('now')),
  ('briefing_canary_fr_02_technology', 'account_canary_fr_02', 'technologie', '[Canari] Technologie', 0, 'Intelligence artificielle, cybersécurité, logiciels et réglementation numérique.', 'Style technique précis, sans promotion.', 1, 0, 'fr', 15, 'low', 0.03, 'daily', '15:00', 'Europe/Paris', NULL, datetime('now'), datetime('now')),
  ('briefing_canary_fr_03_climate', 'account_canary_fr_03', 'climat', '[Canari] Climat', 0, 'Science du climat, adaptation, énergie propre et politique environnementale.', 'Privilégier les résultats mesurés.', 1, 0, 'fr', 15, 'low', 0.03, 'daily', '10:00', 'Europe/Paris', NULL, datetime('now'), datetime('now')),
  ('briefing_canary_fr_03_health', 'account_canary_fr_03', 'sante-publique', '[Canari] Santé publique', 0, 'Santé publique, épidémies, politique sanitaire et preuves médicales.', 'Ne pas fournir de conseil médical personnel.', 1, 0, 'fr', 15, 'low', 0.03, 'daily', '16:00', 'Europe/Paris', NULL, datetime('now'), datetime('now'));

-- Keep reruns idempotent for existing cohorts and schedule the first hourly
-- edition at the next UTC hour boundary.
UPDATE briefings
SET briefing_cadence = 'hourly',
    paused = 0,
    next_briefing_at = CASE
      WHEN next_briefing_at IS NULL OR next_briefing_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        THEN strftime('%Y-%m-%dT%H:00:00.000Z', 'now', '+1 hour')
      ELSE next_briefing_at
    END,
    updated_at = datetime('now')
WHERE owner_account_id IN (
  SELECT id FROM accounts WHERE username LIKE 'canary-%'
);

-- Thirty-three external sources: direct RSS, Google News RSS, Telegram, and X,
-- plus three internal synthetic fixtures.
INSERT INTO sources (
  id, briefing_id, title, type, provider, kind, username, input, source_url,
  actor_id, actor_input_json, enabled, last_seen_at, created_at, updated_at
) VALUES
  ('source_canary_en_world_bbc', 'briefing_canary_en_01_world', 'BBC World', 'channel', 'rss', 'rss_feed', NULL, 'rss: https://feeds.bbci.co.uk/news/world/rss.xml', 'https://feeds.bbci.co.uk/news/world/rss.xml', NULL, NULL, 1, datetime('now'), datetime('now'), datetime('now')),
  ('source_canary_en_world_aj', 'briefing_canary_en_01_world', 'Al Jazeera English', 'channel', 'rss', 'rss_feed', NULL, 'rss: https://www.aljazeera.com/xml/rss/all.xml', 'https://www.aljazeera.com/xml/rss/all.xml', NULL, NULL, 1, datetime('now'), datetime('now'), datetime('now')),
  ('source_canary_en_me_google', 'briefing_canary_en_01_middle_east', 'Google News: Middle East policy', 'channel', 'rss', 'google_news', NULL, 'news: Middle East diplomacy economy security', 'https://news.google.com/rss/search?q=Middle+East+diplomacy+economy+security&hl=en-US&gl=US&ceid=US:en', NULL, NULL, 1, datetime('now'), datetime('now'), datetime('now')),
  ('source_canary_en_tech_ars', 'briefing_canary_en_02_technology', 'Ars Technica', 'channel', 'rss', 'rss_feed', NULL, 'rss: https://feeds.arstechnica.com/arstechnica/index', 'https://feeds.arstechnica.com/arstechnica/index', NULL, NULL, 1, datetime('now'), datetime('now'), datetime('now')),
  ('source_canary_en_tech_tc', 'briefing_canary_en_02_technology', 'TechCrunch', 'channel', 'rss', 'rss_feed', NULL, 'rss: https://techcrunch.com/feed/', 'https://techcrunch.com/feed/', NULL, NULL, 1, datetime('now'), datetime('now'), datetime('now')),
  ('source_canary_en_startups', 'briefing_canary_en_02_startups', 'Google News: startups', 'channel', 'rss', 'google_news', NULL, 'news: startup funding acquisition shutdown', 'https://news.google.com/rss/search?q=startup+funding+acquisition+shutdown&hl=en-US&gl=US&ceid=US:en', NULL, NULL, 1, datetime('now'), datetime('now'), datetime('now')),
  ('source_canary_en_science_nature', 'briefing_canary_en_03_science', 'Nature', 'channel', 'rss', 'rss_feed', NULL, 'rss: https://www.nature.com/nature.rss', 'https://www.nature.com/nature.rss', NULL, NULL, 1, datetime('now'), datetime('now'), datetime('now')),
  ('source_canary_en_health', 'briefing_canary_en_03_health', 'Google News: public health', 'channel', 'rss', 'google_news', NULL, 'news: public health policy medical research', 'https://news.google.com/rss/search?q=public+health+policy+medical+research&hl=en-US&gl=US&ceid=US:en', NULL, NULL, 1, datetime('now'), datetime('now'), datetime('now')),
  ('source_canary_en_ai', 'briefing_canary_en_04_ai', 'Google News: AI research', 'channel', 'rss', 'google_news', NULL, 'news: AI research model evaluation regulation', 'https://news.google.com/rss/search?q=AI+research+model+evaluation+regulation&hl=en-US&gl=US&ceid=US:en', NULL, NULL, 1, datetime('now'), datetime('now'), datetime('now')),
  ('source_canary_en_ai_x', 'briefing_canary_en_04_ai', '@OpenAI', 'channel', 'apify', 'x_profile', 'OpenAI', 'x: @OpenAI', 'https://x.com/OpenAI', 'xquik/x-tweet-scraper', '{"searchTerms":["from:OpenAI"],"queryType":"Latest","maxItems":20}', 1, datetime('now'), datetime('now'), datetime('now')),
  ('source_canary_en_climate', 'briefing_canary_en_04_climate', 'Google News: climate policy', 'channel', 'rss', 'google_news', NULL, 'news: climate science clean energy policy', 'https://news.google.com/rss/search?q=climate+science+clean+energy+policy&hl=en-US&gl=US&ceid=US:en', NULL, NULL, 1, datetime('now'), datetime('now'), datetime('now')),
  ('source_canary_en_energy', 'briefing_canary_en_05_energy', 'Google News: energy transition', 'channel', 'rss', 'google_news', NULL, 'news: electricity grid renewable energy batteries', 'https://news.google.com/rss/search?q=electricity+grid+renewable+energy+batteries&hl=en-US&gl=US&ceid=US:en', NULL, NULL, 1, datetime('now'), datetime('now'), datetime('now')),
  ('source_canary_en_lebanon', 'briefing_canary_en_05_lebanon', 'Google News: Lebanon economy', 'channel', 'rss', 'google_news', NULL, 'news: Lebanon economy energy infrastructure', 'https://news.google.com/rss/search?q=Lebanon+economy+energy+infrastructure&hl=en-US&gl=US&ceid=US:en', NULL, NULL, 1, datetime('now'), datetime('now'), datetime('now')),

  ('source_canary_ar_world_f24', 'briefing_canary_ar_01_world', 'فرانس 24 عربي', 'channel', 'rss', 'rss_feed', NULL, 'rss: https://www.france24.com/ar/rss', 'https://www.france24.com/ar/rss', NULL, NULL, 1, datetime('now'), datetime('now'), datetime('now')),
  ('source_canary_ar_world_bbc', 'briefing_canary_ar_01_world', 'BBC عربي', 'channel', 'rss', 'rss_feed', NULL, 'rss: https://feeds.bbci.co.uk/arabic/rss.xml', 'https://feeds.bbci.co.uk/arabic/rss.xml', NULL, NULL, 1, datetime('now'), datetime('now'), datetime('now')),
  ('source_canary_ar_me', 'briefing_canary_ar_01_middle_east', 'أخبار الشرق الأوسط', 'channel', 'rss', 'google_news', NULL, 'news: الشرق الأوسط سياسة اقتصاد أمن', 'https://news.google.com/rss/search?q=%D8%A7%D9%84%D8%B4%D8%B1%D9%82+%D8%A7%D9%84%D8%A3%D9%88%D8%B3%D8%B7+%D8%B3%D9%8A%D8%A7%D8%B3%D8%A9+%D8%A7%D9%82%D8%AA%D8%B5%D8%A7%D8%AF&hl=ar&gl=LB&ceid=LB:ar', NULL, NULL, 1, datetime('now'), datetime('now'), datetime('now')),
  ('source_canary_ar_lebanon_tg', 'briefing_canary_ar_02_lebanon', 'LBCI_NEWS Telegram', 'channel', 'telegram', 'telegram_channel', 'LBCI_NEWS', 'https://t.me/LBCI_NEWS', 'https://t.me/LBCI_NEWS', NULL, NULL, 1, datetime('now'), datetime('now'), datetime('now')),
  ('source_canary_ar_lebanon_google', 'briefing_canary_ar_02_lebanon', 'أخبار لبنان', 'channel', 'rss', 'google_news', NULL, 'news: لبنان اقتصاد كهرباء بنوك', 'https://news.google.com/rss/search?q=%D9%84%D8%A8%D9%86%D8%A7%D9%86+%D8%A7%D9%82%D8%AA%D8%B5%D8%A7%D8%AF+%D9%83%D9%87%D8%B1%D8%A8%D8%A7%D8%A1+%D8%A8%D9%86%D9%88%D9%83&hl=ar&gl=LB&ceid=LB:ar', NULL, NULL, 1, datetime('now'), datetime('now'), datetime('now')),
  ('source_canary_ar_lebanon_x', 'briefing_canary_ar_02_lebanon', '@LBCI_NEWS', 'channel', 'apify', 'x_profile', 'LBCI_NEWS', 'x: @LBCI_NEWS', 'https://x.com/LBCI_NEWS', 'xquik/x-tweet-scraper', '{"searchTerms":["from:LBCI_NEWS"],"queryType":"Latest","maxItems":20}', 1, datetime('now'), datetime('now'), datetime('now')),
  ('source_canary_ar_economy', 'briefing_canary_ar_02_economy', 'الاقتصاد العربي', 'channel', 'rss', 'google_news', NULL, 'news: الاقتصاد العربي أسواق سياسة مالية', 'https://news.google.com/rss/search?q=%D8%A7%D9%84%D8%A7%D9%82%D8%AA%D8%B5%D8%A7%D8%AF+%D8%A7%D9%84%D8%B9%D8%B1%D8%A8%D9%8A+%D8%A3%D8%B3%D9%88%D8%A7%D9%82&hl=ar&gl=AE&ceid=AE:ar', NULL, NULL, 1, datetime('now'), datetime('now'), datetime('now')),
  ('source_canary_ar_ai', 'briefing_canary_ar_03_ai', 'الذكاء الاصطناعي', 'channel', 'rss', 'google_news', NULL, 'news: الذكاء الاصطناعي أبحاث نماذج تنظيم', 'https://news.google.com/rss/search?q=%D8%A7%D9%84%D8%B0%D9%83%D8%A7%D8%A1+%D8%A7%D9%84%D8%A7%D8%B5%D8%B7%D9%86%D8%A7%D8%B9%D9%8A+%D8%A3%D8%A8%D8%AD%D8%A7%D8%AB+%D9%86%D9%85%D8%A7%D8%B0%D8%AC&hl=ar&gl=AE&ceid=AE:ar', NULL, NULL, 1, datetime('now'), datetime('now'), datetime('now')),
  ('source_canary_ar_science', 'briefing_canary_ar_03_science', 'علوم وتقنية', 'channel', 'rss', 'google_news', NULL, 'news: علوم تقنية أبحاث جديدة', 'https://news.google.com/rss/search?q=%D8%B9%D9%84%D9%88%D9%85+%D8%AA%D9%82%D9%86%D9%8A%D8%A9+%D8%A3%D8%A8%D8%AD%D8%A7%D8%AB&hl=ar&gl=AE&ceid=AE:ar', NULL, NULL, 1, datetime('now'), datetime('now'), datetime('now')),
  ('source_canary_ar_climate', 'briefing_canary_ar_04_climate', 'الطاقة والمناخ', 'channel', 'rss', 'google_news', NULL, 'news: مناخ طاقة نظيفة سياسة بيئية', 'https://news.google.com/rss/search?q=%D9%85%D9%86%D8%A7%D8%AE+%D8%B7%D8%A7%D9%82%D8%A9+%D9%86%D8%B8%D9%8A%D9%81%D8%A9&hl=ar&gl=AE&ceid=AE:ar', NULL, NULL, 1, datetime('now'), datetime('now'), datetime('now')),
  ('source_canary_ar_health', 'briefing_canary_ar_04_health', 'الصحة العامة', 'channel', 'rss', 'google_news', NULL, 'news: صحة عامة سياسة صحية أبحاث طبية', 'https://news.google.com/rss/search?q=%D8%B5%D8%AD%D8%A9+%D8%B9%D8%A7%D9%85%D8%A9+%D8%A3%D8%A8%D8%AD%D8%A7%D8%AB+%D8%B7%D8%A8%D9%8A%D8%A9&hl=ar&gl=AE&ceid=AE:ar', NULL, NULL, 1, datetime('now'), datetime('now'), datetime('now')),

  ('source_canary_fr_world_f24', 'briefing_canary_fr_01_world', 'France 24', 'channel', 'rss', 'rss_feed', NULL, 'rss: https://www.france24.com/fr/rss', 'https://www.france24.com/fr/rss', NULL, NULL, 1, datetime('now'), datetime('now'), datetime('now')),
  ('source_canary_fr_world_google', 'briefing_canary_fr_01_world', 'Actualité mondiale', 'channel', 'rss', 'google_news', NULL, 'news: actualité mondiale diplomatie élections', 'https://news.google.com/rss/search?q=actualit%C3%A9+mondiale+diplomatie+%C3%A9lections&hl=fr&gl=FR&ceid=FR:fr', NULL, NULL, 1, datetime('now'), datetime('now'), datetime('now')),
  ('source_canary_fr_world_x', 'briefing_canary_fr_01_world', '@France24_fr', 'channel', 'apify', 'x_profile', 'France24_fr', 'x: @France24_fr', 'https://x.com/France24_fr', 'xquik/x-tweet-scraper', '{"searchTerms":["from:France24_fr"],"queryType":"Latest","maxItems":20}', 1, datetime('now'), datetime('now'), datetime('now')),
  ('source_canary_fr_lebanon', 'briefing_canary_fr_01_lebanon', 'Actualité du Liban', 'channel', 'rss', 'google_news', NULL, 'news: Liban économie énergie politique', 'https://news.google.com/rss/search?q=Liban+%C3%A9conomie+%C3%A9nergie+politique&hl=fr&gl=FR&ceid=FR:fr', NULL, NULL, 1, datetime('now'), datetime('now'), datetime('now')),
  ('source_canary_fr_science', 'briefing_canary_fr_02_science', 'Science et recherche', 'channel', 'rss', 'google_news', NULL, 'news: science recherche santé publique', 'https://news.google.com/rss/search?q=science+recherche+sant%C3%A9+publique&hl=fr&gl=FR&ceid=FR:fr', NULL, NULL, 1, datetime('now'), datetime('now'), datetime('now')),
  ('source_canary_fr_science_nature', 'briefing_canary_fr_02_science', 'Nature', 'channel', 'rss', 'rss_feed', NULL, 'rss: https://www.nature.com/nature.rss', 'https://www.nature.com/nature.rss', NULL, NULL, 1, datetime('now'), datetime('now'), datetime('now')),
  ('source_canary_fr_tech', 'briefing_canary_fr_02_technology', 'Technologie et IA', 'channel', 'rss', 'google_news', NULL, 'news: technologie intelligence artificielle cybersécurité', 'https://news.google.com/rss/search?q=technologie+intelligence+artificielle+cybers%C3%A9curit%C3%A9&hl=fr&gl=FR&ceid=FR:fr', NULL, NULL, 1, datetime('now'), datetime('now'), datetime('now')),
  ('source_canary_fr_climate', 'briefing_canary_fr_03_climate', 'Climat et énergie', 'channel', 'rss', 'google_news', NULL, 'news: climat énergie propre politique environnementale', 'https://news.google.com/rss/search?q=climat+%C3%A9nergie+propre+politique+environnementale&hl=fr&gl=FR&ceid=FR:fr', NULL, NULL, 1, datetime('now'), datetime('now'), datetime('now')),
  ('source_canary_fr_health', 'briefing_canary_fr_03_health', 'Santé publique', 'channel', 'rss', 'google_news', NULL, 'news: santé publique recherche médicale politique', 'https://news.google.com/rss/search?q=sant%C3%A9+publique+recherche+m%C3%A9dicale+politique&hl=fr&gl=FR&ceid=FR:fr', NULL, NULL, 1, datetime('now'), datetime('now'), datetime('now')),
  ('source_canary_fixture_en', 'briefing_canary_en_02_technology', 'Synthetic canary fixture', 'channel', 'rss', 'rss_feed', NULL, 'synthetic:canary-fixture', 'https://example.invalid/canary/en', NULL, NULL, 1, datetime('now'), datetime('now'), datetime('now')),
  ('source_canary_fixture_ar', 'briefing_canary_ar_01_middle_east', 'اختبار اصطناعي', 'channel', 'rss', 'rss_feed', NULL, 'synthetic:canary-fixture', 'https://example.invalid/canary/ar', NULL, NULL, 1, datetime('now'), datetime('now'), datetime('now')),
  ('source_canary_fixture_fr', 'briefing_canary_fr_02_technology', 'Canari synthétique', 'channel', 'rss', 'rss_feed', NULL, 'synthetic:canary-fixture', 'https://example.invalid/canary/fr', NULL, NULL, 1, datetime('now'), datetime('now'), datetime('now'))
ON CONFLICT(id) DO UPDATE SET
  briefing_id = excluded.briefing_id,
  title = excluded.title,
  type = excluded.type,
  provider = excluded.provider,
  kind = excluded.kind,
  username = excluded.username,
  input = excluded.input,
  source_url = excluded.source_url,
  actor_id = excluded.actor_id,
  actor_input_json = excluded.actor_input_json,
  enabled = 1,
  updated_at = datetime('now');

-- Google News uses the same Apify account as X. The public Google News URL is
-- retained only as the readable query/locale carrier.
UPDATE sources
SET provider = 'apify',
    actor_id = 'groupoject/google-news-scraper',
    actor_input_json = NULL,
    updated_at = datetime('now')
WHERE id LIKE 'source_canary_%'
  AND kind = 'google_news';

UPDATE sources
SET enabled = 1,
    canonical_key = lower(provider || '|' || kind || '|' || rtrim(trim(COALESCE(username, source_url, input, title)), '/')),
    last_error = NULL,
    health_state = 'healthy',
    failure_class = NULL,
    consecutive_failures = 0,
    next_retry_at = NULL,
    updated_at = datetime('now')
WHERE id LIKE 'source_canary_%';

UPDATE sources
SET input = 'synthetic:canary-fixture'
WHERE id IN ('source_canary_fixture_en', 'source_canary_fixture_ar', 'source_canary_fixture_fr');

UPDATE sources
SET actor_id = 'xquik/x-tweet-scraper',
    actor_input_json = CASE id
      WHEN 'source_canary_en_ai_x' THEN '{"searchTerms":["from:OpenAI"],"queryType":"Latest","maxItems":20}'
      WHEN 'source_canary_ar_lebanon_x' THEN '{"searchTerms":["from:LBCI_NEWS"],"queryType":"Latest","maxItems":20}'
      WHEN 'source_canary_fr_world_x' THEN '{"searchTerms":["from:France24_fr"],"queryType":"Latest","maxItems":20}'
    END,
    updated_at = datetime('now')
WHERE id IN ('source_canary_en_ai_x', 'source_canary_ar_lebanon_x', 'source_canary_fr_world_x');

SELECT
  (SELECT COUNT(*) FROM accounts WHERE id LIKE 'account_canary_%') AS accounts,
  (SELECT COUNT(*) FROM briefings WHERE id LIKE 'briefing_canary_%') AS briefings,
  (SELECT COUNT(*) FROM sources WHERE id LIKE 'source_canary_%') AS sources;
