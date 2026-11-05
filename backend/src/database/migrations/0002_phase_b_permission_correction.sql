REVOKE EXECUTE ON FUNCTION public.initialize_balance_projection(uuid, varchar) FROM bg_bank_runtime;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.repair_balance_projection(uuid, varchar) FROM bg_bank_readonly;
