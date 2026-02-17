import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .limit(1);

  if (error) {
    return NextResponse.json({ status: "error", error });
  }

  return NextResponse.json({
    status: "connected",
    sample: data,
  });
}
