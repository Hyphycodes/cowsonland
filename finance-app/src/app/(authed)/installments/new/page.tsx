import { createClient } from "@/lib/supabase/server";
import type { Account } from "@/types/db";
import NewPlanFlow from "./flow";

export const dynamic = "force-dynamic";

export default async function NewInstallmentPage() {
  const supabase = await createClient();
  const { data: accounts } = await supabase
    .from("accounts")
    .select("*")
    .order("name", { ascending: true })
    .returns<Account[]>();

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .order("name", { ascending: true });

  return (
    <NewPlanFlow
      accounts={accounts ?? []}
      categories={(categories ?? []) as { id: string; name: string }[]}
    />
  );
}
