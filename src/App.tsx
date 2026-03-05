import { useState, useMemo, useEffect } from "react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const PRAYERS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
const PRIORITIES = ["Low", "Medium", "High"];
const STATUSES = ["To Do", "In Progress", "Done", "Overdue"];
const PROJECTS = [
  "Website Redesign",
  "Mobile App",
  "Marketing",
  "Backend API",
  "Other",
];
const P_COLORS: Record<string, string> = {
  Low: "#60a5fa",
  Medium: "#fbbf24",
  High: "#f87171",
};
const S_COLORS: Record<string, string> = {
  "To Do": "#94a3b8",
  "In Progress": "#818cf8",
  Done: "#34d399",
  Overdue: "#f87171",
};
const HABIT_COLORS = [
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
  "#ec4899",
];

interface Task {
  id: number;
  title: string;
  project: string;
  priority: string;
  status: string;
  due: string;
  reminderTime: string;
  reminderFired: boolean;
}
interface Habit {
  id: number;
  name: string;
  freq: string;
  color: string;
  checkins: Record<string, boolean>;
  locked?: boolean;
  prayers?: Record<string, string[]>;
}
interface AlertItem {
  id: number;
  title: string;
  project: string;
  priority: string;
}

// ── Persistence ──
function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
function saveToStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

// ── CST Date helpers ──
function cstNow(): Date {
  const now = new Date();
  return new Date(
    now.getTime() + now.getTimezoneOffset() * 60000 + 8 * 3600000
  );
}
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")}`;
}
function todayStr(): string {
  return localDateStr(cstNow());
}
function getWeekKey(): string {
  const d = cstNow();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return localDateStr(d);
}
function getMonthKey(): string {
  const d = cstNow();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function currentKey(freq: string): string {
  if (freq === "daily") return todayStr();
  if (freq === "weekly") return getWeekKey();
  return getMonthKey();
}

function getCurrentMonthDays(): string[] {
  const today = cstNow();
  today.setHours(0, 0, 0, 0);
  const total = new Date(
    today.getFullYear(),
    today.getMonth() + 1,
    0
  ).getDate();
  const days: string[] = [];
  for (let i = 1; i <= total; i++)
    days.push(localDateStr(new Date(today.getFullYear(), today.getMonth(), i)));
  return days;
}
function getLast12Weeks(): string[] {
  const weeks: string[] = [];
  const today = cstNow();
  today.setHours(0, 0, 0, 0);
  for (let i = 11; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - d.getDay() - i * 7);
    weeks.push(localDateStr(d));
  }
  return weeks;
}
function getLast12Months(): string[] {
  const months: string[] = [];
  const today = cstNow();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    );
  }
  return months;
}
function getKeys(freq: string): string[] {
  if (freq === "daily") return getCurrentMonthDays();
  if (freq === "weekly") return getLast12Weeks();
  return getLast12Months();
}
function calcStreak(checkins: Record<string, boolean>, freq: string) {
  const keys = getKeys(freq);
  const today = todayStr();
  const past = freq === "daily" ? keys.filter((k) => k <= today) : keys;
  let streak = 0,
    best = 0,
    cur = 0;
  for (let i = 0; i < past.length; i++) {
    if (checkins[past[i]]) {
      cur++;
      best = Math.max(best, cur);
    } else cur = 0;
  }
  for (let i = past.length - 1; i >= 0; i--) {
    if (checkins[past[i]]) streak++;
    else break;
  }
  return { streak, best };
}
function calcRate(checkins: Record<string, boolean>, freq: string) {
  const keys = getKeys(freq);
  const today = todayStr();
  const past = freq === "daily" ? keys.filter((k) => k <= today) : keys;
  const done = past.filter((k) => checkins[k]).length;
  return {
    done,
    total: past.length,
    rate: past.length === 0 ? 0 : Math.round((done / past.length) * 100),
  };
}
// Prayer checkins store count per day instead of boolean
function getPrayerColor(count: number, isToday: boolean): string {
  if (count === 0) return "#e2e8f0";
  if (count === 5) return "#0ea5e9";
  if (!isToday) return "#f87171"; // past day, incomplete = red
  return "#7dd3fc"; // today, in progress = light blue
}

function genDemoCheckins(rate: number = 0.7): Record<string, boolean> {
  const res: Record<string, boolean> = {};
  const today = cstNow();
  today.setHours(0, 0, 0, 0);
  const total = new Date(
    today.getFullYear(),
    today.getMonth() + 1,
    0
  ).getDate();
  for (let i = 1; i <= total; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), i);
    if (d > today) break;
    if (Math.random() < rate) res[localDateStr(d)] = true;
  }
  return res;
}

// ── Initial Data ──
const INIT_TASKS: Task[] = [
  {
    id: 1,
    title: "Design homepage mockup",
    project: "Website Redesign",
    priority: "High",
    status: "Done",
    due: "2026-02-20",
    reminderTime: "",
    reminderFired: false,
  },
  {
    id: 2,
    title: "Set up API endpoints",
    project: "Backend API",
    priority: "High",
    status: "In Progress",
    due: "2026-03-10",
    reminderTime: "",
    reminderFired: false,
  },
  {
    id: 3,
    title: "Write blog post",
    project: "Marketing",
    priority: "Low",
    status: "To Do",
    due: "2026-03-15",
    reminderTime: "",
    reminderFired: false,
  },
  {
    id: 4,
    title: "Fix login bug",
    project: "Mobile App",
    priority: "High",
    status: "Overdue",
    due: "2026-02-28",
    reminderTime: "",
    reminderFired: false,
  },
  {
    id: 5,
    title: "Update dependencies",
    project: "Backend API",
    priority: "Medium",
    status: "To Do",
    due: "2026-03-20",
    reminderTime: "",
    reminderFired: false,
  },
  {
    id: 6,
    title: "User testing session",
    project: "Mobile App",
    priority: "Medium",
    status: "In Progress",
    due: "2026-03-08",
    reminderTime: "",
    reminderFired: false,
  },
  {
    id: 7,
    title: "SEO audit",
    project: "Marketing",
    priority: "Medium",
    status: "Done",
    due: "2026-02-25",
    reminderTime: "",
    reminderFired: false,
  },
  {
    id: 8,
    title: "Responsive CSS fixes",
    project: "Website Redesign",
    priority: "Low",
    status: "In Progress",
    due: "2026-03-12",
    reminderTime: "",
    reminderFired: false,
  },
];

const INIT_REGULAR_HABITS: Habit[] = [
  {
    id: 1,
    name: "Go to Gym",
    freq: "daily",
    color: "#6366f1",
    checkins: genDemoCheckins(0.65),
  },
  {
    id: 2,
    name: "Read 20 mins",
    freq: "daily",
    color: "#10b981",
    checkins: genDemoCheckins(0.8),
  },
  {
    id: 3,
    name: "Weekly Review",
    freq: "weekly",
    color: "#f59e0b",
    checkins: genDemoCheckins(0.75),
  },
  {
    id: 4,
    name: "Meal Prep",
    freq: "weekly",
    color: "#ef4444",
    checkins: genDemoCheckins(0.6),
  },
];

// ── Components ──
function Toast({
  alerts,
  onDismiss,
}: {
  alerts: AlertItem[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        left: 16,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        pointerEvents: "none",
      }}
    >
      {alerts.map((a) => (
        <div
          key={a.id}
          style={{
            background: "#1e1b4b",
            color: "#fff",
            borderRadius: 14,
            padding: "14px 16px",
            boxShadow: "0 4px 24px #0004",
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            pointerEvents: "all",
            animation: "slideIn 0.3s ease",
          }}
        >
          <span style={{ fontSize: 22 }}>⏰</span>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>
              Reminder: {a.title}
            </p>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: "#a5b4fc" }}>
              {a.project} · {a.priority} Priority
            </p>
          </div>
          <button
            onClick={() => onDismiss(a.id)}
            style={{
              background: "none",
              border: "none",
              color: "#a5b4fc",
              fontSize: 18,
              cursor: "pointer",
              padding: 0,
            }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

function PrayerHeatmap({ prayers }: { prayers: Record<string, string[]> }) {
  const days = getCurrentMonthDays();
  const today = todayStr();
  const now = cstNow();
  const monthName = now.toLocaleString("en", { month: "long" });
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
  const blanks = Array(firstDay).fill(null);
  const allCells = [...blanks, ...days];
  return (
    <div>
      <p
        style={{
          margin: "0 0 8px",
          fontSize: 12,
          fontWeight: 700,
          color: "#64748b",
        }}
      >
        {monthName} {now.getFullYear()} · CST
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7,1fr)",
          gap: 3,
          marginBottom: 3,
        }}
      >
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div
            key={d}
            style={{
              textAlign: "center",
              fontSize: 9,
              color: "#94a3b8",
              fontWeight: 600,
            }}
          >
            {d}
          </div>
        ))}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7,1fr)",
          gap: 3,
        }}
      >
        {allCells.map((d, i) => {
          if (d === null) return <div key={`b${i}`} />;
          const isFuture = d > today;
          const isToday = d === today;
          const count = (prayers[d] || []).length;
          const pct = count / 5;
          // Color logic
          let fillColor = "#e2e8f0";
          if (!isFuture && count > 0) {
            fillColor =
              count === 5 ? "#0ea5e9" : isToday ? "#7dd3fc" : "#f87171";
          }
          return (
            <div
              key={d}
              title={`${d}: ${count}/5 prayers`}
              style={{
                aspectRatio: "1",
                borderRadius: 4,
                background: isFuture ? "#f1f5f9" : "#e2e8f0",
                border: isToday ? `2px solid #0ea5e9` : "2px solid transparent",
                opacity: isFuture ? 0.4 : 1,
                overflow: "hidden",
                position: "relative",
              }}
            >
              {/* Fill from bottom by % */}
              {!isFuture && count > 0 && (
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: `${pct * 100}%`,
                    background: fillColor,
                    transition: "height 0.3s",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginTop: 10,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: 3,
            background: "#0ea5e9",
          }}
        />
        <span style={{ fontSize: 11, color: "#64748b" }}>All 5 ✅</span>
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: 3,
            background: "#7dd3fc",
            marginLeft: 8,
          }}
        />
        <span style={{ fontSize: 11, color: "#64748b" }}>Today (partial)</span>
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: 3,
            background: "#f87171",
            marginLeft: 8,
          }}
        />
        <span style={{ fontSize: 11, color: "#64748b" }}>Missed some</span>
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: 3,
            background: "#e2e8f0",
            marginLeft: 8,
          }}
        />
        <span style={{ fontSize: 11, color: "#64748b" }}>None</span>
      </div>
    </div>
  );
}

function Heatmap({ habit }: { habit: Habit }) {
  const days = getCurrentMonthDays();
  const today = todayStr();
  const now = cstNow();
  const monthName = now.toLocaleString("en", { month: "long" });
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
  const blanks = Array(firstDay).fill(null);
  const allCells = [...blanks, ...days];
  return (
    <div>
      <p
        style={{
          margin: "0 0 8px",
          fontSize: 12,
          fontWeight: 700,
          color: "#64748b",
        }}
      >
        {monthName} {now.getFullYear()} · CST
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7,1fr)",
          gap: 3,
          marginBottom: 3,
        }}
      >
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div
            key={d}
            style={{
              textAlign: "center",
              fontSize: 9,
              color: "#94a3b8",
              fontWeight: 600,
            }}
          >
            {d}
          </div>
        ))}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7,1fr)",
          gap: 3,
        }}
      >
        {allCells.map((d, i) =>
          d === null ? (
            <div key={`b${i}`} />
          ) : (
            <div
              key={d}
              title={d}
              style={{
                aspectRatio: "1",
                borderRadius: 4,
                background:
                  d > today
                    ? "#f1f5f9"
                    : habit.checkins[d]
                    ? habit.color
                    : "#e2e8f0",
                border:
                  d === today
                    ? `2px solid ${habit.color}`
                    : "2px solid transparent",
                opacity: d > today ? 0.4 : 1,
              }}
            />
          )
        )}
      </div>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginTop: 10,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: 3,
            background: habit.color,
          }}
        />
        <span style={{ fontSize: 11, color: "#64748b" }}>Done</span>
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: 3,
            background: "#e2e8f0",
            marginLeft: 8,
          }}
        />
        <span style={{ fontSize: 11, color: "#64748b" }}>Missed</span>
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: 3,
            background: "#f1f5f9",
            opacity: 0.4,
            marginLeft: 8,
          }}
        />
        <span style={{ fontSize: 11, color: "#94a3b8" }}>Upcoming</span>
      </div>
    </div>
  );
}
function WeeklyGrid({ habit }: { habit: Habit }) {
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {getLast12Weeks().map((w) => (
        <div
          key={w}
          title={`Week of ${w}`}
          style={{
            width: 22,
            height: 22,
            borderRadius: 5,
            background: habit.checkins[w] ? habit.color : "#e2e8f0",
          }}
        />
      ))}
    </div>
  );
}
function MonthlyGrid({ habit }: { habit: Habit }) {
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {getLast12Months().map((m) => (
        <div
          key={m}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: habit.checkins[m] ? habit.color : "#e2e8f0",
            }}
          />
          <span style={{ fontSize: 9, color: "#94a3b8" }}>
            {new Date(m + "-01").toLocaleString("en", { month: "short" })}
          </span>
        </div>
      ))}
    </div>
  );
}

const emptyForm = {
  title: "",
  project: PROJECTS[0],
  priority: "Medium",
  status: "To Do",
  due: "",
  reminderTime: "",
};
const emptyHabit = { name: "", freq: "daily", color: HABIT_COLORS[0] };

export default function App() {
  const [tasks, setTasks] = useState<Task[]>(() =>
    loadFromStorage("tasks", INIT_TASKS)
  );

  // Load habits: always ensure prayer habit (id=0) is first
  const [habits, setHabits] = useState<Habit[]>(() => {
    const saved = loadFromStorage<Habit[]>("habits", []);
    const savedPrayers = loadFromStorage<Record<string, string[]>>(
      "prayers",
      {}
    );
    const prayerHabit: Habit = {
      id: 0,
      name: "🕌 Daily Prayers",
      freq: "daily",
      color: "#0ea5e9",
      locked: true,
      checkins: {},
      prayers: savedPrayers,
    };
    // rebuild checkins from prayers
    Object.entries(savedPrayers).forEach(([day, list]) => {
      if ((list as string[]).length === 5) prayerHabit.checkins[day] = true;
    });
    const regular = saved.filter((h) => h.id !== 0);
    if (regular.length === 0) return [prayerHabit, ...INIT_REGULAR_HABITS];
    return [prayerHabit, ...regular];
  });

  const [form, setForm] = useState(emptyForm);
  const [habitForm, setHabitForm] = useState(emptyHabit);
  const [showHabitForm, setShowHabitForm] = useState(false);
  const [search, setSearch] = useState("");
  const [filterProject, setFilterProject] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterPriority, setFilterPriority] = useState("All");
  const [activeTab, setActiveTab] = useState("overview");
  const [nextId, setNextId] = useState(() => {
    const t = loadFromStorage<Task[]>("tasks", INIT_TASKS);
    return Math.max(...t.map((t) => t.id), INIT_TASKS.length) + 1;
  });
  const [nextHabitId, setNextHabitId] = useState(() => {
    const h = loadFromStorage<Habit[]>("habits", INIT_REGULAR_HABITS);
    const ids = h.filter((x) => x.id !== 0).map((x) => x.id);
    return ids.length ? Math.max(...ids) + 1 : INIT_REGULAR_HABITS.length + 1;
  });
  const [toastAlerts, setToastAlerts] = useState<AlertItem[]>([]);
  const [editReminder, setEditReminder] = useState<number | null>(null);
  const [reminderInput, setReminderInput] = useState("");
  const [notifPerm, setNotifPerm] = useState("default");
  const [expandedHabit, setExpandedHabit] = useState<number | null>(null);

  useEffect(() => saveToStorage("tasks", tasks), [tasks]);
  useEffect(() => {
    const ph = habits.find((h) => h.id === 0);
    if (ph?.prayers) saveToStorage("prayers", ph.prayers);
    saveToStorage(
      "habits",
      habits.filter((h) => h.id !== 0)
    );
  }, [habits]);

  useEffect(() => {
    if ("Notification" in window) setNotifPerm(Notification.permission);
  }, []);
  const requestNotifPerm = async () => {
    if ("Notification" in window)
      setNotifPerm(await Notification.requestPermission());
  };

  useEffect(() => {
    const check = () => {
      const now = cstNow();
      setTasks((prev) =>
        prev.map((t) => {
          if (t.reminderTime && !t.reminderFired && t.status !== "Done") {
            if (new Date(t.reminderTime).getTime() <= now.getTime()) {
              setToastAlerts((a) => [
                ...a,
                {
                  id: t.id,
                  title: t.title,
                  project: t.project,
                  priority: t.priority,
                },
              ]);
              if (notifPerm === "granted")
                new Notification(`⏰ ${t.title}`, {
                  body: `${t.project} · ${t.priority}`,
                });
              return { ...t, reminderFired: true };
            }
          }
          return t;
        })
      );
    };
    check();
    const iv = setInterval(check, 30000);
    return () => clearInterval(iv);
  }, [notifPerm]);

  const dismissToast = (id: number) =>
    setToastAlerts((a) => a.filter((t) => t.id !== id));

  // Prayer toggle
  const togglePrayer = (prayer: string) => {
    const today = todayStr();
    setHabits((p) =>
      p.map((h) => {
        if (h.id !== 0) return h;
        const prayers = { ...(h.prayers || {}) };
        const todayList = [...(prayers[today] || [])];
        if (todayList.includes(prayer))
          prayers[today] = todayList.filter((pr) => pr !== prayer);
        else prayers[today] = [...todayList, prayer];
        const checkins = { ...h.checkins };
        if ((prayers[today] || []).length === 5) checkins[today] = true;
        else delete checkins[today];
        return { ...h, prayers, checkins };
      })
    );
  };

  const getPrayedToday = () => {
    const ph = habits.find((h) => h.id === 0);
    return ph?.prayers?.[todayStr()] || [];
  };

  const kpis = useMemo(
    () => ({
      total: tasks.length,
      done: tasks.filter((t) => t.status === "Done").length,
      inProgress: tasks.filter((t) => t.status === "In Progress").length,
      overdue: tasks.filter((t) => t.status === "Overdue").length,
      reminders: tasks.filter(
        (t) => t.reminderTime && !t.reminderFired && t.status !== "Done"
      ).length,
    }),
    [tasks]
  );

  const statusData = STATUSES.map((s) => ({
    name: s,
    value: tasks.filter((t) => t.status === s).length,
  }));
  const habitBarData = habits.map((h) => ({
    name: h.id === 0 ? "Prayers" : h.name,
    rate: calcRate(h.checkins, h.freq).rate,
    color: h.color,
  }));

  const filtered = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.title.toLowerCase().includes(search.toLowerCase()) &&
          (filterProject === "All" || t.project === filterProject) &&
          (filterStatus === "All" || t.status === filterStatus) &&
          (filterPriority === "All" || t.priority === filterPriority)
      ),
    [tasks, search, filterProject, filterStatus, filterPriority]
  );

  const addTask = () => {
    if (!form.title.trim()) return;
    setTasks((p) => [...p, { ...form, id: nextId, reminderFired: false }]);
    setNextId((n) => n + 1);
    setForm(emptyForm);
    setActiveTab("tasks");
  };
  const updateStatus = (id: number, status: string) =>
    setTasks((p) => p.map((t) => (t.id === id ? { ...t, status } : t)));
  const deleteTask = (id: number) =>
    setTasks((p) => p.filter((t) => t.id !== id));
  const saveReminder = (id: number) => {
    setTasks((p) =>
      p.map((t) =>
        t.id === id
          ? { ...t, reminderTime: reminderInput, reminderFired: false }
          : t
      )
    );
    setEditReminder(null);
    setReminderInput("");
  };
  const clearReminder = (id: number) => {
    setTasks((p) =>
      p.map((t) =>
        t.id === id ? { ...t, reminderTime: "", reminderFired: false } : t
      )
    );
    setEditReminder(null);
  };

  const toggleCheckin = (habitId: number) => {
    setHabits((p) => {
      const habit = p.find((h) => h.id === habitId);
      if (!habit) return p;
      const key = currentKey(habit.freq);
      return p.map((h) => {
        if (h.id !== habitId) return h;
        const c = { ...h.checkins };
        if (c[key]) delete c[key];
        else c[key] = true;
        return { ...h, checkins: c };
      });
    });
  };
  const addHabit = () => {
    if (!habitForm.name.trim()) return;
    setHabits((p) => [...p, { ...habitForm, id: nextHabitId, checkins: {} }]);
    setNextHabitId((n) => n + 1);
    setHabitForm(emptyHabit);
    setShowHabitForm(false);
  };
  const deleteHabit = (id: number) =>
    setHabits((p) => p.filter((h) => h.id !== id));

  const upcomingReminders = tasks
    .filter((t) => t.reminderTime && !t.reminderFired && t.status !== "Done")
    .sort(
      (a, b) =>
        new Date(a.reminderTime).getTime() - new Date(b.reminderTime).getTime()
    );

  const inp =
    "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white";
  const sel = inp + " appearance-none";
  const TABS = [
    ["overview", "Overview"],
    ["tasks", "Tasks"],
    ["habits", "Habits"],
    ["reminders", `Remind${kpis.reminders > 0 ? ` (${kpis.reminders})` : "s"}`],
    ["add", "+ Add"],
  ];

  return (
    <div
      style={{
        fontFamily: "system-ui,sans-serif",
        background: "#f1f5f9",
        minHeight: "100vh",
      }}
    >
      <style>{`@keyframes slideIn{from{opacity:0;transform:translateY(-12px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <Toast alerts={toastAlerts} onDismiss={dismissToast} />

      <div
        style={{
          background: "linear-gradient(135deg,#1e1b4b 0%,#312e81 100%)",
          padding: "20px 16px 0",
        }}
      >
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <div>
              <h1
                style={{
                  color: "#fff",
                  fontSize: 20,
                  fontWeight: 700,
                  margin: 0,
                }}
              >
                📋 Task Dashboard
              </h1>
              <p style={{ color: "#a5b4fc", fontSize: 13, margin: "2px 0 0" }}>
                {cstNow().toLocaleString("en", {
                  month: "long",
                  year: "numeric",
                })}{" "}
                · CST
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 3, overflowX: "auto" }}>
            {TABS.map(([id, label]) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                style={{
                  flex: "0 0 auto",
                  padding: "8px 14px",
                  border: "none",
                  background: activeTab === id ? "#fff" : "transparent",
                  color: activeTab === id ? "#4338ca" : "#a5b4fc",
                  borderRadius: "8px 8px 0 0",
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: 16 }}>
        {/* OVERVIEW */}
        {activeTab === "overview" && (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
                marginBottom: 16,
              }}
            >
              {[
                {
                  label: "Total Tasks",
                  val: kpis.total,
                  color: "#6366f1",
                  bg: "#eef2ff",
                },
                {
                  label: "Completed",
                  val: kpis.done,
                  color: "#10b981",
                  bg: "#ecfdf5",
                },
                {
                  label: "In Progress",
                  val: kpis.inProgress,
                  color: "#8b5cf6",
                  bg: "#f5f3ff",
                },
                {
                  label: "Overdue",
                  val: kpis.overdue,
                  color: "#ef4444",
                  bg: "#fef2f2",
                },
              ].map(({ label, val, color, bg }) => (
                <div
                  key={label}
                  style={{
                    background: bg,
                    borderRadius: 14,
                    padding: "14px 16px",
                    border: `1.5px solid ${color}22`,
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12,
                      color: "#64748b",
                      fontWeight: 500,
                    }}
                  >
                    {label}
                  </p>
                  <p
                    style={{
                      margin: "4px 0 0",
                      fontSize: 28,
                      fontWeight: 800,
                      color,
                    }}
                  >
                    {val}
                  </p>
                </div>
              ))}
            </div>
            <div
              style={{
                background: "#fff",
                borderRadius: 14,
                padding: 16,
                marginBottom: 16,
                boxShadow: "0 1px 4px #0001",
              }}
            >
              <p
                style={{
                  margin: "0 0 8px",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#1e293b",
                }}
              >
                Overall Progress
              </p>
              <div
                style={{
                  background: "#e2e8f0",
                  borderRadius: 99,
                  height: 10,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${Math.round((kpis.done / kpis.total) * 100)}%`,
                    background: "linear-gradient(90deg,#6366f1,#10b981)",
                    height: "100%",
                    borderRadius: 99,
                  }}
                />
              </div>
              <p style={{ margin: "6px 0 0", fontSize: 12, color: "#64748b" }}>
                {Math.round((kpis.done / kpis.total) * 100)}% complete
              </p>
            </div>
            <div
              style={{
                background: "#fff",
                borderRadius: 14,
                padding: 16,
                marginBottom: 16,
                boxShadow: "0 1px 4px #0001",
              }}
            >
              <p
                style={{
                  margin: "0 0 8px",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#1e293b",
                }}
              >
                Tasks by Status
              </p>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {statusData.map((e, i) => (
                      <Cell key={i} fill={S_COLORS[e.name]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend
                    iconType="circle"
                    iconSize={10}
                    wrapperStyle={{ fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div
              style={{
                background: "#fff",
                borderRadius: 14,
                padding: 16,
                marginBottom: 16,
                boxShadow: "0 1px 4px #0001",
              }}
            >
              <p
                style={{
                  margin: "0 0 8px",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#1e293b",
                }}
              >
                Habit Completion Rates
              </p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={habitBarData} barSize={28} layout="vertical">
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tickFormatter={(v: number | string) => `${v}%`}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 10 }}
                    width={85}
                  />
                  <Tooltip formatter={(v: number | string) => `${v}%`} />
                  <Bar dataKey="rate" radius={[0, 6, 6, 0]}>
                    {habitBarData.map((e, i) => (
                      <Cell key={i} fill={e.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}

        {/* HABITS */}
        {activeTab === "habits" && (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#1e293b",
                }}
              >
                Your Habits
              </p>
              <button
                onClick={() => setShowHabitForm((s) => !s)}
                style={{
                  background: "#6366f1",
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  padding: "7px 14px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                + New Habit
              </button>
            </div>
            {showHabitForm && (
              <div
                style={{
                  background: "#fff",
                  borderRadius: 14,
                  padding: 16,
                  marginBottom: 14,
                  boxShadow: "0 1px 4px #0001",
                }}
              >
                <p
                  style={{
                    margin: "0 0 12px",
                    fontWeight: 700,
                    fontSize: 14,
                    color: "#1e293b",
                  }}
                >
                  Add Habit
                </p>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 10 }}
                >
                  <input
                    className={inp}
                    placeholder="Habit name (e.g. Go to Gym)"
                    value={habitForm.name}
                    onChange={(e) =>
                      setHabitForm((f) => ({ ...f, name: e.target.value }))
                    }
                  />
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 10,
                    }}
                  >
                    <div>
                      <label
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#64748b",
                          display: "block",
                          marginBottom: 4,
                        }}
                      >
                        Frequency
                      </label>
                      <select
                        className={sel}
                        value={habitForm.freq}
                        onChange={(e) =>
                          setHabitForm((f) => ({ ...f, freq: e.target.value }))
                        }
                      >
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </div>
                    <div>
                      <label
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#64748b",
                          display: "block",
                          marginBottom: 4,
                        }}
                      >
                        Color
                      </label>
                      <div
                        style={{
                          display: "flex",
                          gap: 6,
                          flexWrap: "wrap",
                          paddingTop: 4,
                        }}
                      >
                        {HABIT_COLORS.map((c) => (
                          <div
                            key={c}
                            onClick={() =>
                              setHabitForm((f) => ({ ...f, color: c }))
                            }
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 99,
                              background: c,
                              cursor: "pointer",
                              border:
                                habitForm.color === c
                                  ? "3px solid #1e293b"
                                  : "3px solid transparent",
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={addHabit}
                    style={{
                      background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
                      color: "#fff",
                      border: "none",
                      borderRadius: 10,
                      padding: "10px",
                      fontWeight: 700,
                      fontSize: 14,
                      cursor: "pointer",
                    }}
                  >
                    Add Habit
                  </button>
                </div>
              </div>
            )}
            {habits.length === 0 && (
              <div
                style={{
                  background: "#fff",
                  borderRadius: 14,
                  padding: 32,
                  textAlign: "center",
                  color: "#94a3b8",
                }}
              >
                No habits yet!
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {habits.map((h) => {
                // ── Prayer Card ──
                if (h.id === 0) {
                  const prayedToday = getPrayedToday();
                  const count = prayedToday.length;
                  const { rate } = calcRate(h.checkins, "daily");
                  const isExpanded = expandedHabit === 0;
                  return (
                    <div
                      key={0}
                      style={{
                        background: "#fff",
                        borderRadius: 14,
                        boxShadow: "0 1px 4px #0001",
                        overflow: "hidden",
                        borderTop: "4px solid #0ea5e9",
                      }}
                    >
                      <div style={{ padding: 14 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: 10,
                          }}
                        >
                          <div>
                            <p
                              style={{
                                margin: 0,
                                fontWeight: 700,
                                fontSize: 15,
                                color: "#1e293b",
                              }}
                            >
                              🕌 Daily Prayers
                            </p>
                            <p
                              style={{
                                margin: "2px 0 0",
                                fontSize: 12,
                                color: "#64748b",
                              }}
                            >
                              {count}/5 prayed today {count === 5 ? "✅" : ""}
                            </p>
                          </div>
                          <span
                            style={{
                              background: "#e0f2fe",
                              color: "#0ea5e9",
                              borderRadius: 99,
                              padding: "4px 14px",
                              fontSize: 13,
                              fontWeight: 800,
                            }}
                          >
                            {count}/5
                          </span>
                        </div>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(5,1fr)",
                            gap: 6,
                            marginBottom: 12,
                          }}
                        >
                          {PRAYERS.map((pr) => {
                            const done = prayedToday.includes(pr);
                            return (
                              <button
                                key={pr}
                                onClick={() => togglePrayer(pr)}
                                style={{
                                  padding: "10px 2px",
                                  border: `2px solid ${
                                    done ? "#0ea5e9" : "#e2e8f0"
                                  }`,
                                  borderRadius: 10,
                                  background: done ? "#0ea5e9" : "#fff",
                                  color: done ? "#fff" : "#94a3b8",
                                  fontSize: 11,
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  transition: "all 0.2s",
                                  lineHeight: 1.4,
                                }}
                              >
                                {done ? "✓ " : ""}
                                {pr}
                              </button>
                            );
                          })}
                        </div>
                        <div
                          style={{
                            background: "#e2e8f0",
                            borderRadius: 99,
                            height: 8,
                            overflow: "hidden",
                            marginBottom: 6,
                          }}
                        >
                          <div
                            style={{
                              width: `${(count / 5) * 100}%`,
                              background: "#0ea5e9",
                              height: "100%",
                              borderRadius: 99,
                              transition: "width 0.3s",
                            }}
                          />
                        </div>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginBottom: 6,
                          }}
                        >
                          <span style={{ fontSize: 11, color: "#64748b" }}>
                            Monthly avg prayers/day
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: "#0ea5e9",
                            }}
                          >
                            {(() => {
                              const today = todayStr();
                              const pastDays = getCurrentMonthDays().filter(
                                (d) => d <= today
                              );
                              const total = pastDays.reduce(
                                (sum, d) => sum + (h.prayers?.[d]?.length || 0),
                                0
                              );
                              return pastDays.length
                                ? `${(total / pastDays.length).toFixed(1)}/5`
                                : "0/5";
                            })()}
                          </span>
                        </div>
                        <button
                          onClick={() =>
                            setExpandedHabit(isExpanded ? null : 0)
                          }
                          style={{
                            background: "none",
                            border: "none",
                            color: "#0ea5e9",
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: "pointer",
                            padding: 0,
                          }}
                        >
                          {isExpanded ? "▲ Hide calendar" : "▼ Show calendar"}
                        </button>
                      </div>
                      {isExpanded && (
                        <div
                          style={{
                            background: "#f8fafc",
                            padding: "12px 14px 16px",
                            borderTop: "1px solid #f1f5f9",
                          }}
                        >
                          <PrayerHeatmap prayers={h.prayers || {}} />
                          <p
                            style={{
                              margin: "10px 0 0",
                              fontSize: 11,
                              color: "#94a3b8",
                            }}
                          >
                            Each prayer = 20% · Blue = complete · Red =
                            incomplete day
                          </p>
                        </div>
                      )}
                    </div>
                  );
                }

                // ── Regular Habit Card ──
                const checked = !!h.checkins[currentKey(h.freq)];
                const { streak, best } = calcStreak(h.checkins, h.freq);
                const { done, total, rate } = calcRate(h.checkins, h.freq);
                const isExpanded = expandedHabit === h.id;
                const freqLabel =
                  h.freq === "daily"
                    ? "Today"
                    : h.freq === "weekly"
                    ? "This Week"
                    : "This Month";
                const sfx =
                  h.freq === "daily" ? "d" : h.freq === "weekly" ? "w" : "m";
                return (
                  <div
                    key={h.id}
                    style={{
                      background: "#fff",
                      borderRadius: 14,
                      boxShadow: "0 1px 4px #0001",
                      overflow: "hidden",
                      borderTop: `4px solid ${h.color}`,
                    }}
                  >
                    <div style={{ padding: 14 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                        }}
                      >
                        <button
                          onClick={() => toggleCheckin(h.id)}
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 99,
                            border: `3px solid ${h.color}`,
                            background: checked ? h.color : "#fff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            flexShrink: 0,
                            transition: "all 0.2s",
                            fontSize: 20,
                            color: "#fff",
                          }}
                        >
                          {checked ? "✓" : ""}
                        </button>
                        <div style={{ flex: 1 }}>
                          <p
                            style={{
                              margin: 0,
                              fontWeight: 700,
                              fontSize: 15,
                              color: "#1e293b",
                            }}
                          >
                            {h.name}
                          </p>
                          <p
                            style={{
                              margin: "2px 0 0",
                              fontSize: 12,
                              color: "#64748b",
                            }}
                          >
                            {h.freq.charAt(0).toUpperCase() + h.freq.slice(1)} ·{" "}
                            {checked ? (
                              <span style={{ color: h.color, fontWeight: 700 }}>
                                ✓ Done {freqLabel}
                              </span>
                            ) : (
                              <span style={{ color: "#94a3b8" }}>
                                Not done {freqLabel}
                              </span>
                            )}
                          </p>
                        </div>
                        <button
                          onClick={() => deleteHabit(h.id)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#cbd5e1",
                            fontSize: 16,
                            cursor: "pointer",
                          }}
                        >
                          ✕
                        </button>
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr 1fr 1fr",
                          gap: 6,
                          marginTop: 12,
                        }}
                      >
                        {[
                          ["🔥 Streak", `${streak}${sfx}`],
                          ["🏆 Best", `${best}${sfx}`],
                          ["✅ Done", done],
                          ["⏭ Skipped", total - done],
                        ].map(([label, val]) => (
                          <div
                            key={String(label)}
                            style={{
                              background: "#f8fafc",
                              borderRadius: 10,
                              padding: "6px 4px",
                              textAlign: "center",
                            }}
                          >
                            <p
                              style={{
                                margin: 0,
                                fontSize: 10,
                                color: "#64748b",
                              }}
                            >
                              {label}
                            </p>
                            <p
                              style={{
                                margin: "2px 0 0",
                                fontSize: 15,
                                fontWeight: 800,
                                color: "#1e293b",
                              }}
                            >
                              {val}
                            </p>
                          </div>
                        ))}
                      </div>
                      <div style={{ marginTop: 10 }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginBottom: 4,
                          }}
                        >
                          <span style={{ fontSize: 11, color: "#64748b" }}>
                            Completion rate
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: h.color,
                            }}
                          >
                            {rate}%
                          </span>
                        </div>
                        <div
                          style={{
                            background: "#e2e8f0",
                            borderRadius: 99,
                            height: 8,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${rate}%`,
                              background: h.color,
                              height: "100%",
                              borderRadius: 99,
                              transition: "width 0.4s",
                            }}
                          />
                        </div>
                      </div>
                      <button
                        onClick={() =>
                          setExpandedHabit(isExpanded ? null : h.id)
                        }
                        style={{
                          marginTop: 10,
                          background: "none",
                          border: "none",
                          color: h.color,
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        {isExpanded ? "▲ Hide history" : "▼ Show history"}
                      </button>
                    </div>
                    {isExpanded && (
                      <div
                        style={{
                          background: "#f8fafc",
                          padding: "12px 14px 16px",
                          borderTop: "1px solid #f1f5f9",
                        }}
                      >
                        {h.freq === "daily" && <Heatmap habit={h} />}
                        {h.freq === "weekly" && (
                          <>
                            <p
                              style={{
                                margin: "0 0 8px",
                                fontSize: 12,
                                fontWeight: 700,
                                color: "#64748b",
                              }}
                            >
                              Last 12 Weeks
                            </p>
                            <WeeklyGrid habit={h} />
                          </>
                        )}
                        {h.freq === "monthly" && (
                          <>
                            <p
                              style={{
                                margin: "0 0 8px",
                                fontSize: 12,
                                fontWeight: 700,
                                color: "#64748b",
                              }}
                            >
                              Last 12 Months
                            </p>
                            <MonthlyGrid habit={h} />
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* REMINDERS */}
        {activeTab === "reminders" && (
          <>
            {notifPerm !== "granted" && (
              <div
                style={{
                  background: "#fffbeb",
                  border: "1.5px solid #fbbf24",
                  borderRadius: 14,
                  padding: 14,
                  marginBottom: 14,
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: 22 }}>🔔</span>
                <div style={{ flex: 1 }}>
                  <p
                    style={{
                      margin: 0,
                      fontWeight: 700,
                      fontSize: 13,
                      color: "#92400e",
                    }}
                  >
                    Enable browser notifications
                  </p>
                  <p
                    style={{
                      margin: "2px 0 0",
                      fontSize: 12,
                      color: "#b45309",
                    }}
                  >
                    Get alerts even when tab is in background.
                  </p>
                </div>
                <button
                  onClick={requestNotifPerm}
                  style={{
                    background: "#f59e0b",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    padding: "6px 12px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Enable
                </button>
              </div>
            )}
            {upcomingReminders.length === 0 ? (
              <div
                style={{
                  background: "#fff",
                  borderRadius: 14,
                  padding: 32,
                  textAlign: "center",
                  color: "#94a3b8",
                  fontSize: 14,
                }}
              >
                No upcoming reminders.
              </div>
            ) : (
              upcomingReminders.map((t) => {
                const rem = new Date(t.reminderTime);
                const diff = rem.getTime() - cstNow().getTime();
                const hrs = Math.floor(diff / 3600000),
                  mins = Math.floor((diff % 3600000) / 60000);
                const countdown =
                  diff > 0
                    ? hrs > 0
                      ? `in ${hrs}h ${mins}m`
                      : `in ${mins}m`
                    : "Now!";
                return (
                  <div
                    key={t.id}
                    style={{
                      background: "#fff",
                      borderRadius: 14,
                      padding: 14,
                      boxShadow: "0 1px 4px #0001",
                      borderLeft: `4px solid ${P_COLORS[t.priority]}`,
                      display: "flex",
                      gap: 12,
                      alignItems: "center",
                      marginBottom: 10,
                    }}
                  >
                    <span style={{ fontSize: 26 }}>⏰</span>
                    <div style={{ flex: 1 }}>
                      <p
                        style={{
                          margin: 0,
                          fontWeight: 700,
                          fontSize: 14,
                          color: "#1e293b",
                        }}
                      >
                        {t.title}
                      </p>
                      <p
                        style={{
                          margin: "2px 0 0",
                          fontSize: 12,
                          color: "#64748b",
                        }}
                      >
                        {t.project} ·{" "}
                        {rem.toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                      <span
                        style={{
                          background: "#eef2ff",
                          color: "#6366f1",
                          borderRadius: 99,
                          padding: "2px 10px",
                          fontSize: 11,
                          fontWeight: 700,
                          marginTop: 6,
                          display: "inline-block",
                        }}
                      >
                        {countdown}
                      </span>
                    </div>
                    <button
                      onClick={() => clearReminder(t.id)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#cbd5e1",
                        fontSize: 18,
                        cursor: "pointer",
                      }}
                    >
                      ✕
                    </button>
                  </div>
                );
              })
            )}
          </>
        )}

        {/* ADD TASK */}
        {activeTab === "add" && (
          <div
            style={{
              background: "#fff",
              borderRadius: 14,
              padding: 18,
              boxShadow: "0 1px 4px #0001",
            }}
          >
            <h2
              style={{
                margin: "0 0 14px",
                fontSize: 15,
                fontWeight: 700,
                color: "#1e293b",
              }}
            >
              New Task
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input
                className={inp}
                placeholder="Task title *"
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
              />
              <select
                className={sel}
                value={form.project}
                onChange={(e) =>
                  setForm((f) => ({ ...f, project: e.target.value }))
                }
              >
                {PROJECTS.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                }}
              >
                <select
                  className={sel}
                  value={form.priority}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, priority: e.target.value }))
                  }
                >
                  {PRIORITIES.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
                <select
                  className={sel}
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value }))
                  }
                >
                  {STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
              <input
                type="date"
                className={inp}
                value={form.due}
                onChange={(e) =>
                  setForm((f) => ({ ...f, due: e.target.value }))
                }
              />
              <div>
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#64748b",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  ⏰ Reminder
                </label>
                <input
                  type="datetime-local"
                  className={inp}
                  value={form.reminderTime}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, reminderTime: e.target.value }))
                  }
                />
              </div>
              <button
                onClick={addTask}
                style={{
                  background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  padding: "12px",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Add Task
              </button>
            </div>
          </div>
        )}

        {/* TASKS */}
        {activeTab === "tasks" && (
          <>
            <div
              style={{
                background: "#fff",
                borderRadius: 14,
                padding: 14,
                marginBottom: 12,
                boxShadow: "0 1px 4px #0001",
              }}
            >
              <input
                className={inp}
                placeholder="🔍  Search tasks..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ marginBottom: 10 }}
              />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 8,
                }}
              >
                {(
                  [
                    [
                      "Project",
                      ["All", ...PROJECTS],
                      filterProject,
                      setFilterProject,
                    ],
                    [
                      "Status",
                      ["All", ...STATUSES],
                      filterStatus,
                      setFilterStatus,
                    ],
                    [
                      "Priority",
                      ["All", ...PRIORITIES],
                      filterPriority,
                      setFilterPriority,
                    ],
                  ] as [string, string[], string, (v: string) => void][]
                ).map(([label, opts, val, setter]) => (
                  <div key={label}>
                    <label
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "#94a3b8",
                        display: "block",
                        marginBottom: 3,
                      }}
                    >
                      {label}
                    </label>
                    <select
                      className={sel}
                      value={val}
                      onChange={(e) => setter(e.target.value)}
                      style={{ fontSize: 12 }}
                    >
                      {opts.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
            <p
              style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 8px 2px" }}
            >
              {filtered.length} task{filtered.length !== 1 ? "s" : ""} found
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filtered.length === 0 && (
                <div
                  style={{
                    background: "#fff",
                    borderRadius: 14,
                    padding: 32,
                    textAlign: "center",
                    color: "#94a3b8",
                  }}
                >
                  No tasks match.
                </div>
              )}
              {filtered.map((t) => (
                <div
                  key={t.id}
                  style={{
                    background: "#fff",
                    borderRadius: 14,
                    padding: 14,
                    boxShadow: "0 1px 4px #0001",
                    borderLeft: `4px solid ${P_COLORS[t.priority]}`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 8,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <p
                        style={{
                          margin: 0,
                          fontWeight: 700,
                          fontSize: 14,
                          color: "#1e293b",
                        }}
                      >
                        {t.title}
                      </p>
                      <p
                        style={{
                          margin: "3px 0 0",
                          fontSize: 12,
                          color: "#64748b",
                        }}
                      >
                        {t.project}
                        {t.due ? ` · Due ${t.due}` : ""}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteTask(t.id)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "#cbd5e1",
                        fontSize: 16,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      marginTop: 10,
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <span
                      style={{
                        background: P_COLORS[t.priority] + "22",
                        color: P_COLORS[t.priority],
                        borderRadius: 99,
                        padding: "2px 10px",
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      {t.priority}
                    </span>
                    <select
                      value={t.status}
                      onChange={(e) => updateStatus(t.id, e.target.value)}
                      style={{
                        border: "none",
                        borderRadius: 99,
                        padding: "2px 10px",
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                        background: S_COLORS[t.status] + "22",
                        color: S_COLORS[t.status],
                      }}
                    >
                      {STATUSES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                    {t.reminderTime && (
                      <span
                        style={{
                          background: t.reminderFired ? "#ecfdf5" : "#eef2ff",
                          color: t.reminderFired ? "#10b981" : "#6366f1",
                          borderRadius: 99,
                          padding: "2px 10px",
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        {t.reminderFired
                          ? "✓ Reminded"
                          : `⏰ ${new Date(t.reminderTime).toLocaleString([], {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}`}
                      </span>
                    )}
                  </div>
                  {editReminder === t.id ? (
                    <div
                      style={{
                        marginTop: 10,
                        background: "#f8fafc",
                        borderRadius: 10,
                        padding: 10,
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                        alignItems: "center",
                      }}
                    >
                      <input
                        type="datetime-local"
                        value={reminderInput}
                        onChange={(e) => setReminderInput(e.target.value)}
                        style={{
                          flex: 1,
                          border: "1.5px solid #818cf8",
                          borderRadius: 8,
                          padding: "5px 10px",
                          fontSize: 12,
                          minWidth: 180,
                        }}
                      />
                      <button
                        onClick={() => saveReminder(t.id)}
                        style={{
                          background: "#6366f1",
                          color: "#fff",
                          border: "none",
                          borderRadius: 8,
                          padding: "5px 14px",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Save
                      </button>
                      <button
                        onClick={() => clearReminder(t.id)}
                        style={{
                          background: "#fee2e2",
                          color: "#ef4444",
                          border: "none",
                          borderRadius: 8,
                          padding: "5px 10px",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Clear
                      </button>
                      <button
                        onClick={() => setEditReminder(null)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#94a3b8",
                          fontSize: 12,
                          cursor: "pointer",
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setEditReminder(t.id);
                        setReminderInput(t.reminderTime || "");
                      }}
                      style={{
                        marginTop: 10,
                        background: "none",
                        border: "1.5px dashed #c7d2fe",
                        borderRadius: 8,
                        padding: "4px 12px",
                        fontSize: 11,
                        color: "#818cf8",
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      {t.reminderTime ? "✏️ Edit reminder" : "⏰ Set reminder"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
