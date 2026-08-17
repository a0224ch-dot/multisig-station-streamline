import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type User, type UpdateStatus } from "../api";
import HelpTip from "../components/HelpTip";
import PageIntro from "../components/PageIntro";

export default function BranchUpdatePage({ user }: { user: User }) {
  const canEdit = user.role === "SUPER_ADMIN" || user.role === "EMPLOYEE";
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const s = await api.updateStatus();
      setStatus(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : "读取状态失败");
    }
  }, []);

  useEffect(() => {
    if (!canEdit) return;
    void refresh();
  }, [canEdit, refresh]);

  useEffect(() => {
    if (!canEdit || !status?.busy) return;
    const t = setInterval(() => void refresh(), 2000);
    return () => clearInterval(t);
  }, [canEdit, status?.busy, refresh]);

  async function onCheck() {
    setError("");
    setMsg("");
    setBusy(true);
    try {
      const res = await api.updateCheck();
      setMsg(
        res.updateAvailable
          ? `发现新版本 ${res.latest.version}`
          : "当前已是最新版本"
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "检查失败");
    } finally {
      setBusy(false);
    }
  }

  async function onApply() {
    if (!confirm("确定更新？更新期间网站可能短暂不可用；失败将自动回滚。")) {
      return;
    }
    setError("");
    setMsg("");
    setBusy(true);
    try {
      const res = await api.updateApply();
      setMsg(res.message);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "启动更新失败");
    } finally {
      setBusy(false);
    }
  }

  if (!canEdit) {
    return (
      <div className="card">
        <p className="muted">仅超级管理员可进行系统更新。</p>
      </div>
    );
  }

  const latest = status?.latest;
  const canApply =
    !!status?.latest &&
    !!status.targetVersion &&
    status.targetVersion !== status.currentVersion &&
    !status.busy &&
    !busy;

  const phaseLabel: Record<string, string> = {
    idle: "空闲",
    checking: "检查中",
    queued: "排队中",
    downloading: "下载中",
    verifying: "校验中",
    backing_up: "备份中",
    extracting: "解压覆盖",
    installing: "装依赖",
    migrating: "数据库迁移",
    restarting: "重启服务",
    healthcheck: "健康检查",
    success: "成功",
    rolling_back: "回滚中",
    rolled_back: "已回滚",
    failed: "失败",
  };

  return (
    <div>
      <PageIntro>
        <strong>这页做什么：</strong>
        检查并安装总部发布的新版本。失败会自动回滚；配置和数据库不会被盖掉。
        详见 <Link to="/branch/help#help-update">使用说明 · 系统更新</Link>。
      </PageIntro>
      <div className="card" style={{ maxWidth: 640 }}>
      <h2 style={{ marginTop: 0 }}>系统更新</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        从总部发布仓拉取更新包。失败会自动回滚；配置（.env）和数据库不会被覆盖。
      </p>

      <p>
        当前版本：
        <span className="badge">{status?.currentVersion || "…"}</span>
        <br />
        状态：
        <span className="badge">
          {status ? phaseLabel[status.phase] || status.phase : "…"}
        </span>
        {status?.busy && <span className="muted"> （进行中，请勿关闭）</span>}
      </p>

      {latest && (
        <div
          style={{
            marginBottom: "1rem",
            padding: "0.75rem 1rem",
            background: "var(--panel-2, #f4f4f5)",
            borderRadius: 8,
          }}
        >
          <div>
            线上最新：<strong>{latest.version}</strong>
          </div>
          {latest.notes && (
            <p className="muted" style={{ margin: "0.5rem 0 0", whiteSpace: "pre-wrap" }}>
              {latest.notes}
            </p>
          )}
        </div>
      )}

      {status?.message && (
        <p style={{ marginTop: 0 }}>
          {status.phase === "success" || status.phase === "rolled_back"
            ? status.message
            : status.message}
        </p>
      )}

      {error && <div className="error">{error}</div>}
      {msg && <div style={{ color: "var(--ok)" }}>{msg}</div>}

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
        <span className="inline-actions">
          <button
            className="btn ghost"
            type="button"
            disabled={busy || !!status?.busy}
            onClick={() => void onCheck()}
          >
            检查更新
          </button>
          <HelpTip text="只查询有没有新版本，不会改动网站。" />
        </span>
        <span className="inline-actions">
          <button
            className="btn"
            type="button"
            disabled={busy || !canApply}
            onClick={() => void onApply()}
          >
            立即更新
          </button>
          <HelpTip text="下载并安装新版本。更新中请勿关页；失败会自动回滚。" />
        </span>
        <button className="btn ghost" type="button" onClick={() => void refresh()}>
          刷新状态
        </button>
      </div>

      {status?.logs && status.logs.length > 0 && (
        <pre
          style={{
            marginTop: "1rem",
            maxHeight: 240,
            overflow: "auto",
            fontSize: "0.8rem",
            background: "#111",
            color: "#ddd",
            padding: "0.75rem",
            borderRadius: 8,
          }}
        >
          {status.logs.join("\n")}
        </pre>
      )}
    </div>
    </div>
  );
}
