import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type User } from "../api";
import HelpTip from "../components/HelpTip";
import PageIntro from "../components/PageIntro";

type Row = { address: string; name: string };

const PRESET_COUNT = 2;

function fixedRows(list: Row[], count: number): Row[] {
  const rows = list.slice(0, count).map((x) => ({ address: x.address, name: x.name }));
  while (rows.length < count) rows.push({ address: "", name: "" });
  return rows;
}

export default function BranchPresetsPage({ user }: { user: User }) {
  const [rows, setRows] = useState<Row[]>(() => fixedRows([], PRESET_COUNT));
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const canEdit = user.role === "SUPER_ADMIN" || user.role === "EMPLOYEE";

  useEffect(() => {
    void api
      .listPresets()
      .then((list) => setRows(fixedRows(list, PRESET_COUNT)))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"));
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setMsg("");
    setError("");
    try {
      await api.savePresets(rows);
      setMsg("多签地址已保存（仅用于小额 2/3 开通）");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    }
  }

  return (
    <div>
      <PageIntro>
        <strong>这页做什么：</strong>
        配置本站低档 2/3 的共管地址（恰好 2 个，不含本人）。公网页小额开通用这套；大额超过总部阈值时走平台
        3/4。详见 <Link to="/branch/help#help-presets">使用说明 · 多签地址</Link>。
        <HelpTip text="地址填错会导致开通失败；保存前请与网络（主网/Shasta）核对。" />
      </PageIntro>

      <form className="card" onSubmit={(e) => void save(e)}>
        <h2 style={{ marginTop: 0 }}>多签地址</h2>
        <p className="muted">小额开通用的 2 个预置地址（不含本人）。大额由平台共管，此处不可配置。</p>
        {rows.map((row, i) => (
          <div key={i} style={{ display: "grid", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <input
              className="input"
              placeholder="姓名"
              value={row.name}
              disabled={!canEdit}
              onChange={(e) => {
                const next = [...rows];
                next[i] = { ...next[i], name: e.target.value };
                setRows(next);
              }}
            />
            <input
              className="input"
              placeholder="TRON 地址"
              value={row.address}
              disabled={!canEdit}
              onChange={(e) => {
                const next = [...rows];
                next[i] = { ...next[i], address: e.target.value.trim() };
                setRows(next);
              }}
            />
          </div>
        ))}
        {error && <p className="error">{error}</p>}
        {msg && <p style={{ color: "var(--ok)" }}>{msg}</p>}
        {canEdit && (
          <button className="btn" type="submit">
            保存
          </button>
        )}
      </form>
    </div>
  );
}
