import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type User } from "../api";
import HelpTip from "../components/HelpTip";
import PageIntro from "../components/PageIntro";

const NETWORK_LABEL: Record<"mainnet" | "shasta", string> = {
  shasta: "Shasta 测试网",
  mainnet: "TRON 主网",
};

export default function BranchNetworkPage({ user }: { user: User }) {
  const [network, setNetwork] = useState<"mainnet" | "shasta">("shasta");
  const [draft, setDraft] = useState<"mainnet" | "shasta">("shasta");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const canEdit = user.role === "SUPER_ADMIN";

  useEffect(() => {
    void api
      .getNetworkSetting()
      .then((res) => {
        setNetwork(res.network);
        setDraft(res.network);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"));
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setError("");
    setMsg("");
    try {
      const res = await api.setNetworkSetting(draft);
      setNetwork(res.network as "mainnet" | "shasta");
      setMsg("网络已保存");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    }
  }

  return (
    <div>
      <PageIntro>
        <strong>这页做什么：</strong>
        选择当前用测试网还是主网。切换后，公网页二维码、开通会话与「多签地址」读写都走新网络。
        正式对外请用主网。详见{" "}
        <Link to="/branch/help#help-network">使用说明 · 网络设置</Link>。
      </PageIntro>
      <div className="card" style={{ maxWidth: 520 }}>
        <h2 style={{ marginTop: 0 }}>网络设置</h2>
        <p className="muted">
          当前生效：
          <span className="badge">{NETWORK_LABEL[network]}</span>
          <span className="muted">（{network}）</span>
        </p>
        <p className="muted" style={{ fontSize: "0.9rem" }}>
          主网与 Shasta 各有一套「多签地址」，互不影响。切换网络后请到{" "}
          <Link to="/branch/presets">多签地址</Link> 核对对应网络的 2 个共管地址。
        </p>
        {!canEdit && (
          <p className="muted">仅超级管理员可修改网络；当前为只读查看。</p>
        )}
        <form onSubmit={(e) => void save(e)} style={{ display: "grid", gap: "0.75rem" }}>
          <select
            className="input"
            value={draft}
            disabled={!canEdit}
            onChange={(e) => setDraft(e.target.value as "mainnet" | "shasta")}
          >
            <option value="shasta">Shasta 测试网</option>
            <option value="mainnet">TRON 主网</option>
          </select>
          {error && <div className="error">{error}</div>}
          {msg && <div style={{ color: "var(--ok)" }}>{msg}</div>}
          {canEdit && (
            <div className="inline-actions">
              <button className="btn" type="submit" disabled={draft === network}>
                保存网络
              </button>
              <HelpTip text="保存后立即生效。切到主网前请确认该网络下的多签地址已配好。" />
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
