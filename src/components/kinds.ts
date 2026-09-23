import { FileText, Image, Mic, MonitorPlay, NotebookPen, Type, Video, type LucideIcon } from "lucide-react";
import type { SourceKind } from "@/lib/types";

export const KIND_META: Record<SourceKind, { label: string; icon: LucideIcon }> = {
  pdf: { label: "PDF", icon: FileText },
  audio: { label: "Audio", icon: Mic },
  video: { label: "Video", icon: Video },
  youtube: { label: "YouTube", icon: MonitorPlay },
  image: { label: "Image", icon: Image },
  document: { label: "Document", icon: NotebookPen },
  text: { label: "Text", icon: Type },
};
