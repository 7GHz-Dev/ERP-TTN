"use client";

import { MousePointerClick, UserPlus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Driver, Job, JobPatch } from "@/lib/types";
import {
  addDriver,
  addUnavailability,
  createPlan,
  deleteJobs,
  deleteUnavailability,
  loadBoard,
  subscribeBoard,
  updateJobs,
  type BoardData,
  type NewJobInput,
  type NewPlanInput,
} from "@/lib/data";
import { supabaseBrowser } from "@/lib/supabase/client";
import { DEMO } from "@/lib/demo";
import { assignmentPatch, autoAssign, rankDrivers } from "@/lib/logic/assign";
import { DRIVER_STATE_LABEL, driverDayStatus } from "@/lib/logic/availability";
import { todayBangkok } from "@/lib/logic/dates";
import { jobStatus, jobWeightKg, type StepField } from "@/lib/logic/status";
import type { MessageKind } from "@/lib/logic/messages";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/Modal";
import { button } from "@/components/ui/styles";
import { Header } from "./Header";
import { ReturnAlerts, Summary } from "./Summary";
import { JobList, type Filter } from "./JobList";
import { DriverBrowser } from "./DriverBrowser";
import { ImportDialog } from "./ImportDialog";
import { MessagesDialog } from "./MessagesDialog";
import { JobDialog } from "./JobDialog";
import { AddDriverDialog, LeaveDialog } from "./DriverForms";
import { formatTons } from "./ui";

export function PlanBoard(props: { initialDate: string; userEmail: string }) {
  return (
    <ToastProvider>
      <Board {...props} />
    </ToastProvider>
  );
}

type Dialog =
  | { type: "import" }
  | { type: "messages"; kind?: MessageKind }
  | { type: "job"; id: string }
  | { type: "add-driver" }
  | { type: "drivers" }
  | null;

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/\s+/g, "");

function Board({ initialDate, userEmail }: { initialDate: string; userEmail: string }) {
  const router = useRouter();
  const toast = useToast();
  const today = todayBangkok();

  const [date, setDateState] = useState(initialDate);
  const [data, setData] = useState<BoardData | null>(null);
  const [loadedDate, setLoadedDate] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [leaveFor, setLeaveFor] = useState<Driver | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);

  const savingRef = useRef(0);
  const pendingReload = useRef(false);
  const loadSeq = useRef(0);

  // -------------------------------------------------------------------------
  // data
  // -------------------------------------------------------------------------
  const reload = useCallback(async () => {
    if (savingRef.current > 0) {
      pendingReload.current = true;
      return;
    }
    const seq = ++loadSeq.current;
    try {
      const d = await loadBoard(date);
      if (seq === loadSeq.current) {
        setData(d);
        setLoadError(null);
      }
    } catch (e) {
      if (seq === loadSeq.current) setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      if (seq === loadSeq.current) setLoadedDate(date);
    }
  }, [date]);

  // โหลดเมื่อเปลี่ยนวัน (หน่วงเล็กน้อยเผื่อกดเปลี่ยนวันรัว ๆ)
  useEffect(() => {
    const t = window.setTimeout(() => void reload(), 60);
    return () => window.clearTimeout(t);
  }, [reload]);

  useEffect(() => {
    let t: number | undefined;
    const unsub = subscribeBoard(() => {
      window.clearTimeout(t);
      t = window.setTimeout(reload, 500);
    });
    return () => {
      window.clearTimeout(t);
      unsub();
    };
  }, [reload]);

  const setDate = useCallback((d: string) => {
    setDateState(d);
    setSelected(new Set());
    setActiveId(null);
    window.history.replaceState(null, "", d === todayBangkok() ? "/" : `/?d=${d}`);
  }, []);

  const drivers = useMemo(() => data?.drivers ?? [], [data]);
  const jobs = useMemo(() => data?.jobs ?? [], [data]);
  const leaves = useMemo(() => data?.leaves ?? [], [data]);
  const rates = useMemo(() => data?.rates ?? [], [data]);
  const lookups = useMemo(() => data?.lookups ?? [], [data]);
  const lastJobDate = useMemo(() => data?.lastJobDate ?? new Map<string, string | null>(), [data]);

  const driversById = useMemo(() => new Map(drivers.map((d) => [d.id, d])), [drivers]);
  const jobsById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);
  const truckTypeOf = useCallback((j: Job) => driversById.get(j.driver_id ?? "")?.truck_type ?? null, [driversById]);

  const dayJobs = useMemo(() => jobs.filter((j) => j.plan_date === date), [jobs, date]);
  const visibleJobs = useMemo(() => {
    const q = norm(query);
    return dayJobs.filter((j) => {
      const s = jobStatus(j);
      if (filter === "all" ? false : s !== filter) return false;
      if (!q) return true;
      return [j.container_no, j.bl_no, j.driver_name, j.truck_no, j.customer, j.port].some((f) => norm(f).includes(q));
    });
  }, [dayJobs, filter, query]);

  const dayCounts = useMemo(() => {
    const m = new Map<string, { total: number; unassigned: number }>();
    for (const j of jobs) {
      if (j.cancelled) continue;
      const c = m.get(j.plan_date) ?? { total: 0, unassigned: 0 };
      c.total++;
      if (jobStatus(j) === "unassigned") c.unassigned++;
      m.set(j.plan_date, c);
    }
    return m;
  }, [jobs]);

  const ranked = useMemo(
    () => rankDrivers({ date, drivers, allJobs: jobs, leaves, lastJobDate, excludeJobId: pickerFor ?? activeId ?? undefined }),
    [date, drivers, jobs, leaves, lastJobDate, pickerFor, activeId],
  );

  const recentCustomers = useMemo(() => [...new Set(jobs.map((j) => j.customer).filter(Boolean) as string[])].slice(0, 50), [jobs]);
  const recentShipping = useMemo(() => {
    const s = [...new Set([...jobs.map((j) => j.shipping), ...lookups.filter((l) => l.kind === "shipping").map((l) => l.value)].filter(Boolean) as string[])];
    return s;
  }, [jobs, lookups]);
  const fleets = useMemo(() => [...new Set(drivers.map((d) => d.fleet).filter(Boolean) as string[])].sort(), [drivers]);

  // -------------------------------------------------------------------------
  // mutations
  // -------------------------------------------------------------------------
  const applyLocal = useCallback((list: { id: string; patch: JobPatch }[]) => {
    const m = new Map(list.map((x) => [x.id, x.patch]));
    setData((d) => d && { ...d, jobs: d.jobs.map((j) => (m.has(j.id) ? { ...j, ...m.get(j.id) } : j)) });
  }, []);

  const beginSave = () => {
    savingRef.current++;
    setSaving((s) => s + 1);
  };
  const endSave = () => {
    savingRef.current--;
    setSaving((s) => s - 1);
    if (savingRef.current === 0 && pendingReload.current) {
      pendingReload.current = false;
      reload();
    }
  };

  const patchJobs = useCallback(
    async (list: { job: Job; patch: JobPatch }[], opts: { message?: string; undo?: boolean } = {}): Promise<boolean> => {
      if (!list.length) return true;
      const prev = list.map(({ job, patch }) => ({
        id: job.id,
        patch: Object.fromEntries(Object.keys(patch).map((k) => [k, job[k as keyof Job]])) as JobPatch,
      }));
      const next = list.map((x) => ({ id: x.job.id, patch: x.patch }));
      applyLocal(next);
      beginSave();
      try {
        await updateJobs(next);
        if (opts.message) {
          toast({
            message: opts.message,
            action: opts.undo
              ? {
                  label: "เลิกทำ",
                  onClick: async () => {
                    applyLocal(prev);
                    beginSave();
                    try {
                      await updateJobs(prev);
                    } catch (e) {
                      toast({ tone: "error", message: e instanceof Error ? e.message : String(e) });
                      reload();
                    } finally {
                      endSave();
                    }
                  },
                }
              : undefined,
          });
        }
        return true;
      } catch (e) {
        applyLocal(prev);
        toast({ tone: "error", message: e instanceof Error ? e.message : String(e) });
        return false;
      } finally {
        endSave();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applyLocal, toast, reload],
  );

  const assign = useCallback(
    (jobId: string, d: Driver | null) => {
      const job = jobsById.get(jobId);
      if (!job) return;
      if (d && job.driver_id === d.id) return;
      const patch = assignmentPatch(job, d, rates);
      let message = d ? `${d.name} → ${job.container_no}` : `ล้างคนขับ ${job.container_no}`;
      if (d) {
        const st = driverDayStatus(d, date, jobs, leaves, job.id);
        if (st.state !== "free") message += ` (คนขับนี้${DRIVER_STATE_LABEL[st.state]})`;
      }
      patchJobs([{ job, patch }], { message, undo: true });
    },
    [jobsById, rates, date, jobs, leaves, patchJobs],
  );

  const pickFromPanel = useCallback(
    (d: Driver) => {
      if (!activeId) return;
      assign(activeId, d);
      // ไปตู้ถัดไปที่ยังไม่มีคนขับ
      const order = visibleJobs.filter((j) => !j.cancelled);
      const idx = order.findIndex((j) => j.id === activeId);
      const rest = [...order.slice(idx + 1), ...order.slice(0, Math.max(0, idx))];
      const next = rest.find((j) => jobStatus(j) === "unassigned");
      setActiveId(next?.id ?? null);
    },
    [activeId, assign, visibleJobs],
  );

  const runAutoAssign = useCallback(
    async (targets: Job[], allJobs: Job[], forDate: string = date) => {
      const res = autoAssign({ date: forDate, targets, drivers, allJobs, leaves, lastJobDate });
      const list = res.assignments.map(({ jobId, driverId }) => {
        const job = allJobs.find((j) => j.id === jobId)!;
        return { job, patch: assignmentPatch(job, driversById.get(driverId)!, rates) };
      });
      if (list.length) {
        const company = res.assignments.filter((a) => driversById.get(a.driverId)?.truck_type === "company").length;
        await patchJobs(list, {
          message: `จัดรถแล้ว ${list.length} ตู้ (รถบริษัท ${company} · รถร่วม ${list.length - company})`,
          undo: true,
        });
      }
      if (res.shortage > 0) {
        toast({
          tone: "info",
          duration: 10000,
          message: `ยังขาดรถอีก ${res.shortage} คัน — ต้องหารถร่วมเพิ่ม`,
          action: { label: "ข้อความหารถร่วม", onClick: () => setDialog({ type: "messages", kind: "need-trucks" }) },
        });
      } else if (!list.length) {
        toast({ tone: "info", message: "ไม่มีตู้ที่ต้องจัดรถ" });
      }
    },
    [date, drivers, leaves, lastJobDate, driversById, rates, patchJobs, toast],
  );

  const onAutoAssign = () => {
    const sel = dayJobs.filter((j) => selected.has(j.id));
    const targets = (sel.length ? sel : dayJobs).filter((j) => jobStatus(j) === "unassigned");
    runAutoAssign(targets, jobs);
  };

  const onStep = (list: Job[], field: StepField) => {
    const label = { pickup_date: "รับตู้แล้ว", end_date: "จบงาน", return_date: "คืนตู้แล้ว" }[field];
    patchJobs(
      list.map((job) => ({ job, patch: { [field]: today } as JobPatch })),
      { message: list.length === 1 ? `${list[0].container_no} · ${label}` : `${label} ${list.length} ตู้`, undo: true },
    );
  };

  const onImportSave = async (plan: NewPlanInput, rows: NewJobInput[], opts: { autoAssign: boolean }) => {
    let created: Job[];
    beginSave();
    try {
      created = await createPlan(plan, rows);
    } finally {
      endSave();
    }
    setData((d) => d && { ...d, jobs: [...d.jobs, ...created] });
    setDialog(null);
    if (plan.plan_date !== date) setDate(plan.plan_date);
    setFilter("all");
    toast({ message: `นำเข้าแพลนแล้ว ${created.length} ตู้` });
    if (opts.autoAssign) await runAutoAssign(created, [...jobs, ...created], plan.plan_date);
  };

  const signOut = async () => {
    if (DEMO) return;
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  // -------------------------------------------------------------------------
  // render
  // -------------------------------------------------------------------------
  const activeJob = activeId ? jobsById.get(activeId) : undefined;
  const pickerJob = pickerFor ? jobsById.get(pickerFor) : undefined;
  const dialogJob = dialog?.type === "job" ? jobsById.get(dialog.id) ?? null : null;

  return (
    <div className="flex min-h-dvh flex-col">
      <Header
        date={date}
        today={today}
        setDate={setDate}
        dayCounts={dayCounts}
        saving={saving > 0}
        userEmail={userEmail}
        onImport={() => setDialog({ type: "import" })}
        onDrivers={() => setDialog({ type: "drivers" })}
        onSignOut={signOut}
      />

      <main className="mx-auto grid w-full max-w-[1600px] flex-1 gap-4 px-4 py-4 lg:px-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          {loadError && (
            <div role="alert" className="flex items-center gap-3 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-900 ring-1 ring-rose-200">
              <span className="flex-1">โหลดข้อมูลไม่สำเร็จ: {loadError}</span>
              <button type="button" className={button("secondary", "sm")} onClick={reload}>
                ลองใหม่
              </button>
            </div>
          )}
          <Summary dayJobs={dayJobs} driversById={driversById} />
          <ReturnAlerts
            jobs={jobs}
            today={today}
            onJump={(j) => {
              setDate(j.plan_date);
              setFilter("all");
              setQuery(j.container_no);
            }}
          />
          <JobList
            dayJobs={dayJobs}
            jobs={visibleJobs}
            filter={filter}
            setFilter={setFilter}
            query={query}
            setQuery={setQuery}
            selected={selected}
            setSelected={setSelected}
            activeId={activeId}
            setActiveId={setActiveId}
            driversById={driversById}
            rates={rates}
            today={today}
            loading={loadedDate === null}
            onPick={setPickerFor}
            onPatch={(job, patch) => patchJobs([{ job, patch }])}
            onStep={onStep}
            onEdit={(id) => setDialog({ type: "job", id })}
            onAutoAssign={onAutoAssign}
            onMessages={() => setDialog({ type: "messages" })}
            onImport={() => setDialog({ type: "import" })}
            onClearDrivers={(list) =>
              patchJobs(
                list.map((job) => ({ job, patch: assignmentPatch(job, null, rates) })),
                { message: `ล้างคนขับ ${list.length} ตู้`, undo: true },
              )
            }
          />
        </div>

        {/* คนขับ (เดสก์ท็อป) */}
        <aside aria-label="คนขับ" className="hidden xl:block">
          <div className="sticky top-[8.25rem] flex h-[calc(100dvh-9.5rem)] flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
            <DriverBrowser
              date={date}
              ranked={ranked}
              lastJobDate={lastJobDate}
              onPick={pickFromPanel}
              pickEnabled={!!activeJob}
              currentDriverId={activeJob?.driver_id}
              job={activeJob}
              onLeave={setLeaveFor}
              header={
                <div className="border-b border-slate-200">
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <h2 className="font-semibold">คนขับ</h2>
                    <button type="button" onClick={() => setDialog({ type: "add-driver" })} className={button("ghost", "sm")}>
                      <UserPlus className="size-4" aria-hidden />
                      เพิ่มคนขับ
                    </button>
                  </div>
                  {activeJob ? (
                    <div className="flex items-center gap-2 bg-blue-900 px-3 py-2 text-sm text-white">
                      <span className="min-w-0 flex-1">
                        เลือกคนขับให้ <span className="font-mono font-semibold">{activeJob.container_no}</span>
                        <span className="block text-xs text-blue-200">
                          {formatTons(jobWeightKg(activeJob))} ตัน · {activeJob.port} → {activeJob.destination}
                        </span>
                      </span>
                      <button type="button" aria-label="เลิกเลือกตู้" onClick={() => setActiveId(null)} className="cursor-pointer rounded-md p-1.5 hover:bg-white/10">
                        <X className="size-4" aria-hidden />
                      </button>
                    </div>
                  ) : (
                    <p className="flex items-center gap-2 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      <MousePointerClick className="size-4 shrink-0" aria-hidden />
                      คลิกแถวตู้ทางซ้าย แล้วคลิกคนขับเพื่อจัดรถต่อเนื่อง
                    </p>
                  )}
                </div>
              }
            />
          </div>
        </aside>
      </main>

      {/* เลือกคนขับ */}
      <Modal
        open={!!pickerJob}
        onClose={() => setPickerFor(null)}
        size="md"
        title={pickerJob ? <span>เลือกคนขับ · <span className="font-mono">{pickerJob.container_no}</span></span> : ""}
        subtitle={pickerJob ? `${formatTons(jobWeightKg(pickerJob))} ตัน · ${pickerJob.port ?? "–"} → ${pickerJob.destination ?? "–"} · ${pickerJob.job_type ?? ""}` : undefined}
        footer={
          pickerJob?.driver_name ? (
            <button
              type="button"
              className={button("danger", "md", "mr-auto")}
              onClick={() => {
                assign(pickerJob.id, null);
                setPickerFor(null);
              }}
            >
              ล้างคนขับ
            </button>
          ) : undefined
        }
      >
        {pickerJob && (
          <div className="-mx-5 -my-4 flex h-[60dvh] flex-col">
            <DriverBrowser
              date={date}
              ranked={ranked}
              lastJobDate={lastJobDate}
              autoFocus
              job={pickerJob}
              currentDriverId={pickerJob.driver_id}
              onPick={(d) => {
                assign(pickerJob.id, d);
                setPickerFor(null);
              }}
            />
          </div>
        )}
      </Modal>

      {/* คนขับ (มือถือ/แท็บเล็ต) */}
      <Modal
        open={dialog?.type === "drivers"}
        onClose={() => setDialog(null)}
        title="คนขับ"
        subtitle="ดูสถานะว่าง / แจ้งวันไม่ว่าง"
        footer={
          <button type="button" className={button("secondary")} onClick={() => setDialog({ type: "add-driver" })}>
            <UserPlus className="size-4" aria-hidden />
            เพิ่มคนขับ
          </button>
        }
      >
        <div className="-mx-5 -my-4 flex h-[65dvh] flex-col">
          <DriverBrowser date={date} ranked={ranked} lastJobDate={lastJobDate} onLeave={setLeaveFor} defaultShow="all" />
        </div>
      </Modal>

      {dialog?.type === "import" && (
      <ImportDialog
        open
        onClose={() => setDialog(null)}
        date={date}
        lookups={lookups}
        recentCustomers={recentCustomers}
        recentShipping={recentShipping}
        onSave={onImportSave}
      />
      )}

      {dialog?.type === "messages" && (
        <MessagesDialog
          open
          onClose={() => setDialog(null)}
          date={date}
          dayJobs={dayJobs}
          selectedJobs={dayJobs.filter((j) => selected.has(j.id))}
          initialKind={dialog.kind}
          truckTypeOf={truckTypeOf}
        />
      )}

      {dialogJob && (
      <JobDialog
        key={dialogJob.id}
        job={dialogJob}
        onClose={() => setDialog(null)}
        driver={dialogJob?.driver_id ? driversById.get(dialogJob.driver_id) : undefined}
        rates={rates}
        lookups={lookups}
        onSave={async (job, patch) => {
          const ok = await patchJobs([{ job, patch }], { message: `บันทึก ${job.container_no} แล้ว` });
          if (!ok) throw new Error("บันทึกไม่สำเร็จ");
        }}
        onDelete={async (job) => {
          await deleteJobs([job.id]);
          setData((d) => d && { ...d, jobs: d.jobs.filter((j) => j.id !== job.id) });
          toast({ message: `ลบ ${job.container_no} แล้ว` });
        }}
        onPickDriver={(id) => setPickerFor(id)}
      />
      )}

      {dialog?.type === "add-driver" && (
      <AddDriverDialog
        open
        onClose={() => setDialog(null)}
        fleets={fleets}
        onSave={async (d) => {
          const created = await addDriver(d);
          setData((x) => x && { ...x, drivers: [...x.drivers, created] });
          toast({ message: `เพิ่ม ${created.name} (${created.id}) แล้ว` });
        }}
      />
      )}

      {leaveFor && (
      <LeaveDialog
        key={leaveFor.id}
        driver={leaveFor}
        date={date}
        leaves={leaves}
        onClose={() => setLeaveFor(null)}
        onSave={async (u) => {
          const created = await addUnavailability(u);
          setData((x) => x && { ...x, leaves: [...x.leaves, created] });
          toast({ message: "บันทึกวันไม่ว่างแล้ว" });
        }}
        onDelete={async (id) => {
          await deleteUnavailability(id);
          setData((x) => x && { ...x, leaves: x.leaves.filter((l) => l.id !== id) });
        }}
      />
      )}
    </div>
  );
}
