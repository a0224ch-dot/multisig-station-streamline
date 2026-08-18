import { FormEvent, useEffect, useState } from "react";
import { api, type OpenWalletOption, type User } from "../api";
import HelpTip from "../components/HelpTip";
import PageIntro from "../components/PageIntro";

export default function BranchOpenWalletsPage({ user }: { user: User }) {
  const [catalog, setCatalog] = useState<OpenWalletOption[]>([]);
  const [enabled, setEnabled] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user.role !== "SUPER_ADMIN" && user.role !== "EMPLOYEE") return;
    void api
      .getOpenWalletsSetting()
      .then((r) => {
        setCatalog(r.catalog);
        setEnabled(r.enabled);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"));
  }, [user.role]);

  if (user.role !== "SUPER_ADMIN" && user.role !== "EMPLOYEE") {
    return <div className="error">无权限</div>;
  }

  function toggle(id: string) {
    setEnabled((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    if (!enabled.length) {
      setError("至少勾选一个钱包");
      return;
    }
    setBusy(true);
    try {
      const res = await api.saveOpenWalletsSetting(enabled);
      setEnabled(res.enabled);
      setMsg("已保存。开通页将按勾选显示钱包入口。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageIntro>
        <strong>这页做什么：</strong>
        勾选开通页上要显示哪些手机钱包按钮。列表已按「较容易扫码直进」排在前面，便于按客户常用钱包勾选。
      </PageIntro>
      <form className="card" onSubmit={(e) => void save(e)} style={{ maxWidth: 640, display: "grid", gap: "0.75rem" }}>
      <h2 style={{ marginTop: 0 }}>开通钱包入口</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        公网页二维码始终是普通 HTTPS，不会改成某一家深链。TokenPocket / OKX / Bitget
        用钱包首页扫码较容易直接授权；TronLink 请让客户用「发现 / 浏览器」粘贴链接，不要用首页扫一扫。
        系统相机扫码进入普通浏览器时，会看到下列按钮（深链内置，不可手填）。
      </p>
      <div className="wallet-check-list">
        {catalog.map((w) => (
          <label key={w.id} className="wallet-check">
            <input
              type="checkbox"
              checked={enabled.includes(w.id)}
              onChange={() => toggle(w.id)}
            />
            <span>
              <strong>{w.name}</strong>
              <span className="muted"> — {w.hint}</span>
            </span>
          </label>
        ))}
      </div>
      {error && <div className="error">{error}</div>}
      {msg && <div style={{ color: "var(--ok)" }}>{msg}</div>}
      <div className="inline-actions">
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "保存中…" : "保存"}
        </button>
        <HelpTip text="至少勾选一个钱包。保存后，开通页的钱包按钮列表立即更新。" />
      </div>
    </form>
    </div>
  );
}
