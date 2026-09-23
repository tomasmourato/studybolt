import type { Metadata } from "next";
import { SetWorkspace } from "@/components/set/SetWorkspace";

// Study sets live in the student's browser, so the real title is set client-side once the set loads.
export const metadata: Metadata = { title: "Study set" };

export default async function StudySetPage({ params }: PageProps<"/sets/[id]">) {
  const { id } = await params;
  return <SetWorkspace id={id} />;
}
