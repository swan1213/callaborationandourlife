import { NextResponse } from "next/server";
import { handler, requireUser } from "@/lib/auth";
import { getDisabledPages, saveDisabledPages } from "@/lib/pageAccessStore";

export const GET = handler(async () => {
  await requireUser("admin");
  return NextResponse.json({ disabled: await getDisabledPages() });
});

/** PUT { disabled: { user: [pageKey], bidder: [...], caller: [...] } }: the full table (unknown or locked pages are dropped). */
export const PUT = handler(async (req: Request) => {
  await requireUser("admin");
  const body = await req.json();
  return NextResponse.json({ disabled: await saveDisabledPages(body.disabled) });
});
