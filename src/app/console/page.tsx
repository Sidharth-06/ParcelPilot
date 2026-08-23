import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { Assistant } from "@/app/assistant";

export default async function ConsolePage() {
  const session = await getSession();
  if (!session) redirect("/");
  return <Assistant />;
}
