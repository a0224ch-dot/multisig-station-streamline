import { useEffect, useState } from "react";
import { api } from "../api";
import PageIntro from "../components/PageIntro";

export default function BranchWalletsPage() {
  const [rows, setRows] = useState<
    {
      network: string;
      address: string;
      tier: string;
      channel: string;
      openedAt: string;
      openTxId?: string | null;
    }[]
  >([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .listWallets()
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"));
  }, []);

  return (
    <div>
      <PageIntro>
        <strong>这页做什么：</strong>
        查看本站已经开通成功的钱包地址记录（只读）。
      </PageIntro>
      <div className="card">
      <h2 style={{ marginTop: 0 }}>已开通</h2>
      {error && <div className="error">{error}</div>}
      <table className="table">
        <thead>
          <tr>
            <th>渠道</th>
            <th>网络</th>
            <th>地址</th>
            <th>档位</th>
            <th>时间</th>
            <th>Tx</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.network}-${r.address}`}>
              <td>{r.channel === "internal" ? "A内部" : "B公网"}</td>
              <td>{r.network}</td>
              <td>{r.address}</td>
              <td>
                {r.tier === "THREE_OF_FOUR" || r.tier === "THREE_OF_FIVE"
                  ? r.tier === "THREE_OF_FIVE"
                    ? "3/5(旧)"
                    : "3/4"
                  : "2/3"}
              </td>
              <td>{new Date(r.openedAt).toLocaleString()}</td>
              <td>{r.openTxId || "-"}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={6} className="muted">
                暂无
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
    </div>
  );
}
