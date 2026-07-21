import { useEffect, useState } from "react";
import { APP_NAME } from "./constants";

interface HealthState {
  status: "checking" | "ok" | "error";
  message: string;
}

const todayTasks = [
  { title: "インコの朝ご飯", status: "未完了", owner: "どちらでも" },
  { title: "ゴミ出し", status: "対応中", owner: "相手" },
  { title: "お風呂掃除", status: "完了", owner: "自分" }
] as const;

function isHealthyResponse(data: unknown): boolean {
  if (typeof data !== "object" || data === null) {
    return false;
  }

  return (
    ("status" in data && data.status === "ok") ||
    ("ok" in data && data.ok === true)
  );
}

export function App() {
  const [health, setHealth] = useState<HealthState>({
    status: "checking",
    message: "Worker APIを確認中"
  });

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/health", { signal: controller.signal })
      .then(async (response): Promise<unknown> => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        const isOk = isHealthyResponse(data);
        setHealth({
          status: isOk ? "ok" : "error",
          message: isOk ? "Worker API 接続OK" : "Worker API 応答を確認してください"
        });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setHealth({
          status: "error",
          message: "Worker APIへ接続できません"
        });
      });

    return () => controller.abort();
  }, []);

  return (
    <main className="app-shell">
      <section className="hero" aria-labelledby="app-title">
        <p className="eyebrow">開発準備中</p>
        <h1 id="app-title">{APP_NAME}</h1>
        <p className="lead">
          家庭内の家事と買い物を、二人でやさしく共有するためのPWAです。
        </p>
        <p className={`health health-${health.status}`} role="status">
          {health.message}
        </p>
      </section>

      <section className="panel" aria-labelledby="today-title">
        <div className="section-heading">
          <h2 id="today-title">今日の家事</h2>
          <span>3件</span>
        </div>
        <div className="task-list">
          {todayTasks.map((task) => (
            <article className="task-card" key={task.title}>
              <div>
                <h3>{task.title}</h3>
                <p>{task.owner}</p>
              </div>
              <span className={`status status-${task.status}`}>{task.status}</span>
            </article>
          ))}
        </div>
      </section>

      <nav className="bottom-nav" aria-label="主要画面">
        <a href="#home" aria-current="page">
          ホーム
        </a>
        <a href="#tasks">タスク</a>
        <a href="#shopping">買い物</a>
        <a href="#settings">設定</a>
      </nav>
    </main>
  );
}
