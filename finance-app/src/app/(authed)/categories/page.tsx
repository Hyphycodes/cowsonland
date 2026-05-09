import { createClient } from "@/lib/supabase/server";
import type { Category } from "@/types/db";
import CategoriesClient from "./client";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const supabase = await createClient();
  const { data: cats } = await supabase
    .from("categories")
    .select("*")
    .order("type", { ascending: true })
    .order("sort_order", { ascending: true })
    .returns<Category[]>();

  return <CategoriesClient initial={cats ?? []} />;
}
