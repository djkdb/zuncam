/** 클라이언트/서버 공용: AI 응답 메타데이터 (어떤 경로로 만들어진 결과인지 UI 에 투명하게 표시하기 위함) */
export interface AIMeta {
  source: "ai" | "rules";
  promptVersion: string;
  model: string | null;
  latencyMs: number;
  /** 규칙 기반으로 폴백한 이유 (사용자 표시용 문장) */
  fallbackMessage: string | null;
  /** 검증 과정에서 버려진 필드/문제 (개발자·발표용) */
  issues: string[];
}
