import { redirect } from "next/navigation";

export const metadata = { robots: { index: false, follow: false, nocache: true } };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const source = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string") query.set(key, value);
    else value?.forEach((item) => query.append(key, item));
  }
  redirect(`/admin/global-resources${query.size ? `?${query}` : ""}`);
}
