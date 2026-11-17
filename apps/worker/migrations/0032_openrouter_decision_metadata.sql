ALTER TABLE bounded_decision_events ADD COLUMN decision_kind TEXT;
ALTER TABLE bounded_decision_events ADD COLUMN choice_count INTEGER;
ALTER TABLE bounded_decision_events ADD COLUMN selected_probability REAL;
ALTER TABLE bounded_decision_events ADD COLUMN cost_usd REAL;
