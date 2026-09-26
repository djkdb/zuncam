"use client";

import { Cpu, Sparkles } from "lucide-react";
import type { AIMeta } from "@/lib/ai/meta";
import { Badge } from "./ui";

/** 결과가 AI 로 만들어졌는지, 규칙 기반 폴백인지 항상 표시한다 (가짜 AI 표시 방지) */
export function SourceBadge({ meta }: { meta: AIMeta | null }) {
  if (!meta) return null;
  const detail = [meta.fallbackMessage, meta.model && `model: ${meta.model}`, meta.promptVersion !== "-" && `prompt: ${meta.promptVersion}`, meta.latencyMs ? `${meta.latencyMs}ms` : null, ...meta.issues]
    .filter(Boolean)
    .join("\n");
  return meta.source === "ai" ? (
    <span title={detail}>
      <Badge tone="indigo">
        <Sparkles className="size-3" /> AI{meta.issues.length ? ` · 검증 ${meta.issues.length}건 보정` : ""}
      </Badge>
    </span>
  ) : (
    <span title={detail}>
      <Badge>
        <Cpu className="size-3" /> 규칙 기반
      </Badge>
    </span>
  );
}
