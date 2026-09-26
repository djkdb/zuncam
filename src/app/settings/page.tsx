"use client";

import { Clock3, Cpu, Database, Download, Gauge, Sparkles, Upload, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card, Field, inputCls, SectionTitle } from "@/components/ui";
import { aiApi } from "@/lib/ai/clientApi";
import { CALIBRATION_RULES, computeCalibration } from "@/lib/context/campusContext";
import { actions, clockActions, useCampusStore, useClock } from "@/lib/store";
import { fromMinutes, toMinutes } from "@/lib/time";

export default function SettingsPage() {
  const { data } = useCampusStore();
  const { clock, overridden } = useClock();
  const s = data.settings;
  const [ai, setAi] = useState<{ enabled: boolean; model: string | null } | null>(null);
  const [demoTime, setDemoTime] = useState({ date: "", time: "16:10" });
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    aiApi.status().then(setAi);
  }, []);
  useEffect(() => {
    if (clock.date !== "1970-01-01") setDemoTime((d) => (d.date ? d : { ...d, date: clock.date }));
  }, [clock.date]);

  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campus-os-${clock.date}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importData = async (file: File) => {
    try {
      const dropped = actions.importData(JSON.parse(await file.text()));
      setMessage(dropped ? `가져오기 완료 (형식이 잘못된 항목 ${dropped}개 제외)` : "가져오기 완료");
    } catch {
      setMessage("JSON 파일을 읽을 수 없습니다.");
    }
  };

  const dayWindowError = toMinutes(s.dayEnd) <= toMinutes(s.dayStart) ? "종료 시간은 시작 시간보다 늦어야 합니다" : undefined;

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.14em] text-ink-500 uppercase">Settings</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">설정</h1>
      </div>

      <Card className="space-y-4 p-5">
        <SectionTitle icon={<UserRound className="size-3.5" />}>프로필 · 계획 규칙</SectionTitle>
        <Field label="이름">
          <input className={inputCls} value={s.userName} maxLength={20} onChange={(e) => actions.updateSettings({ userName: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="하루 계획 시작" error={dayWindowError}>
            <input type="time" className={inputCls} value={s.dayStart} onChange={(e) => e.target.value && actions.updateSettings({ dayStart: e.target.value })} />
          </Field>
          <Field label="하루 계획 종료" hint="자정은 00:00 대신 비워두면 24:00">
            <input type="time" className={inputCls} value={s.dayEnd === "24:00" ? "" : s.dayEnd} onChange={(e) => actions.updateSettings({ dayEnd: e.target.value || "24:00" })} />
          </Field>
          <Field label="출발 전 여유(분)">
            <input type="number" min={0} max={60} className={inputCls} value={s.departureBufferMinutes} onChange={(e) => actions.updateSettings({ departureBufferMinutes: Math.min(60, Math.max(0, Number(e.target.value) || 0)) })} />
          </Field>
          <Field label="예상 소요시간 자동 보정">
            <label className="flex h-10 items-center gap-2 text-sm">
              <input type="checkbox" checked={s.calibrateEstimates} onChange={(e) => actions.updateSettings({ calibrateEstimates: e.target.checked })} className="size-4" />
              완료한 과제의 실제 시간으로 보정
            </label>
          </Field>
          <Field label="식사 시간 확보">
            <label className="flex h-10 items-center gap-2 text-sm">
              <input type="checkbox" checked={s.reserveMeals} onChange={(e) => actions.updateSettings({ reserveMeals: e.target.checked })} className="size-4" />
              점심·저녁 시간을 계획에 비워둠
            </label>
          </Field>
        </div>
      </Card>

      <CalibrationCard />

      <Card className="space-y-3 p-5">
        <SectionTitle icon={<Sparkles className="size-3.5" />}>AI 연결 상태</SectionTitle>
        {ai === null ? (
          <p className="text-sm text-ink-500">확인 중…</p>
        ) : ai.enabled ? (
          <p className="flex items-center gap-2 text-sm">
            <Badge tone="indigo">
              <Sparkles className="size-3" /> 연결됨
            </Badge>
            모델 <code className="rounded bg-ink-100 px-1 text-xs">{ai.model}</code>
          </p>
        ) : (
          <div className="space-y-1 text-sm">
            <p className="flex items-center gap-2">
              <Badge>
                <Cpu className="size-3" /> 규칙 기반 모드
              </Badge>
            </p>
            <p className="text-ink-500">
              서버 환경변수 <code className="rounded bg-ink-100 px-1 text-xs">ANTHROPIC_API_KEY</code>를 설정하면 AI 설명·자연어 해석이 활성화됩니다. 우선순위·계획·충돌 계산은 AI 없이도 동일하게 동작합니다.
            </p>
          </div>
        )}
      </Card>

      <Card className="space-y-3 p-5">
        <SectionTitle icon={<Clock3 className="size-3.5" />}>데모 시간</SectionTitle>
        <p className="text-sm text-ink-500">발표·테스트용으로 &lsquo;현재 시각&rsquo;을 고정합니다. 이 탭을 닫으면 실제 시간으로 돌아옵니다.</p>
        <div className="flex flex-wrap items-end gap-2">
          <input type="date" className={`${inputCls} w-auto`} value={demoTime.date} onChange={(e) => setDemoTime({ ...demoTime, date: e.target.value })} aria-label="데모 날짜" />
          <input type="time" className={`${inputCls} w-auto`} value={demoTime.time} onChange={(e) => setDemoTime({ ...demoTime, time: e.target.value })} aria-label="데모 시각" />
          <Button onClick={() => demoTime.date && demoTime.time && clockActions.setOverride(demoTime)}>적용</Button>
          {overridden && (
            <Button variant="ghost" onClick={() => clockActions.setOverride(null)}>
              실제 시간으로 ({fromMinutes(clock.minutes)} 고정 해제)
            </Button>
          )}
        </div>
      </Card>

      <Card className="space-y-3 p-5">
        <SectionTitle icon={<Database className="size-3.5" />}>데이터</SectionTitle>
        <p className="text-sm text-ink-500">
          데이터는 이 브라우저(localStorage)에만 저장됩니다. 수업 {data.timetable.length} · 과제 {data.assignments.length} · 일정 {data.events.length}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportData}>
            <Download className="size-4" /> 내보내기
          </Button>
          <Button onClick={() => fileRef.current?.click()}>
            <Upload className="size-4" /> 가져오기
          </Button>
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])} />
          <Button
            onClick={() => {
              if (confirm("현재 데이터를 지우고 오늘 기준 샘플 데이터를 불러올까요?")) {
                actions.loadDemo(clock.date);
                setMessage("샘플 데이터를 불러왔습니다.");
              }
            }}
          >
            샘플 데이터
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (confirm("시간표·과제·일정을 모두 삭제할까요? (설정은 유지)")) {
                actions.resetAll();
                setMessage("모든 데이터를 삭제했습니다.");
              }
            }}
          >
            전체 삭제
          </Button>
        </div>
        {message && <p className="text-xs text-emerald-700">{message}</p>}
      </Card>
    </div>
  );
}

function CalibrationCard() {
  const { data } = useCampusStore();
  const c = computeCalibration(data);
  return (
    <Card className="space-y-2 p-5">
      <SectionTitle icon={<Gauge className="size-3.5" />}>예상 소요시간 학습</SectionTitle>
      {c.observed === null ? (
        <p className="text-sm text-ink-500">
          진행 기록이 있는 완료 과제가 {CALIBRATION_RULES.minSamples}개 이상 쌓이면, 실제로 걸린 시간과 예상의 비율을 학습해 남은 과제의 계획에 반영합니다. (현재 {c.samples}개)
        </p>
      ) : (
        <>
          <p className="text-sm">
            최근 완료한 과제 {c.samples}개는 예상의 <b className="tabular">{c.observed.toFixed(2)}배</b>가 걸렸어요.
          </p>
          <p className="text-sm text-ink-500">
            {c.applied
              ? `남은 과제의 예상 소요시간에 ×${c.factor.toFixed(2)}를 적용해 계획합니다.`
              : !data.settings.calibrateEstimates
                ? "자동 보정이 꺼져 있어 입력한 예상 그대로 계획합니다."
                : `차이가 ${Math.round(CALIBRATION_RULES.deadZone * 100)}% 미만이라 보정하지 않습니다.`}
          </p>
        </>
      )}
    </Card>
  );
}
