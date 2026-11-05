CREATE OR REPLACE FUNCTION public.validate_ledger_hierarchy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.parent_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.parent_id = NEW.id THEN RAISE EXCEPTION 'ledger account cannot be its own parent'; END IF;
  IF EXISTS (
    WITH RECURSIVE ancestors(id, path, cycle) AS (
      SELECT NEW.parent_id, ARRAY[NEW.parent_id], false
      UNION ALL
      SELECT la.parent_id, a.path || la.parent_id, la.parent_id = ANY(a.path)
      FROM public.ledger_accounts la
      JOIN ancestors a ON la.id = a.id
      WHERE a.id IS NOT NULL AND NOT a.cycle
    )
    SELECT 1 FROM ancestors WHERE NEW.id = ANY(path) OR cycle
  ) THEN RAISE EXCEPTION 'ledger account hierarchy contains a cycle'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
ALTER FUNCTION public.validate_ledger_hierarchy() OWNER TO bg_bank_owner;
--> statement-breakpoint
CREATE TRIGGER ledger_accounts_hierarchy_guard BEFORE INSERT OR UPDATE OF parent_id ON public.ledger_accounts FOR EACH ROW EXECUTE FUNCTION public.validate_ledger_hierarchy();
