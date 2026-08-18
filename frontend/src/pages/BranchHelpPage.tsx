import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { HELP_DOC_VERSION, HELP_SECTIONS } from "../help/helpContent";
import { DEV_TELEGRAM_HANDLE, DEV_TELEGRAM_URL } from "../devContact";

export default function BranchHelpPage() {
  const [appVersion, setAppVersion] = useState("");

  useEffect(() => {
    void api
      .health()
      .then((h) => setAppVersion(h.version || ""))
      .catch(() => setAppVersion(""));
  }, []);

  const mismatch =
    appVersion && HELP_DOC_VERSION && appVersion !== HELP_DOC_VERSION;

  return (
    <div className="card help-doc" style={{ maxWidth: 720 }}>
      <h2 style={{ marginTop: 0 }}>使用说明</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        精简版操作手册：公网页开通 + 本站配置。
      </p>
      <p style={{ fontSize: "0.9rem" }}>
        本说明对应版本：
        <span className="badge">{HELP_DOC_VERSION}</span>
        {appVersion && (
          <>
            {" "}
            · 当前运行：
            <span className="badge">{appVersion}</span>
          </>
        )}
      </p>
      {mismatch && (
        <p className="error" style={{ fontSize: "0.9rem" }}>
          说明版本与运行版本不一致。请到「系统更新」升到最新，或联系技术支持。
        </p>
      )}

      <nav className="help-toc">
        {HELP_SECTIONS.map((s) => (
          <a key={s.id} href={`#help-${s.id}`}>
            {s.title}
            {s.advanced ? " · 进阶" : ""}
          </a>
        ))}
      </nav>

      {HELP_SECTIONS.map((s) => (
        <section key={s.id} id={`help-${s.id}`} className="help-section">
          <h3>
            {s.title}
            {s.advanced && <span className="badge" style={{ marginLeft: 8 }}>进阶</span>}
          </h3>
          <ol>
            {s.steps.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
          {s.tips && s.tips.length > 0 && (
            <ul className="help-tips">
              {s.tips.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <p className="muted" style={{ marginTop: "1.5rem", fontSize: "0.85rem" }}>
        快捷入口：
        <Link to="/branch/presets">多签地址</Link>
        {" · "}
        <Link to="/branch/network">网络设置</Link>
        {" · "}
        <Link to="/branch/wallets">已开通</Link>
        {" · "}
        <Link to="/branch/decor">装修</Link>
        {" · "}
        <Link to="/branch/open-wallets">开通钱包</Link>
        {" · "}
        <Link to="/branch/update">更新</Link>
        {" · "}
        <Link to="/branch/password">修改密码</Link>
      </p>
      <p className="muted" style={{ marginTop: "0.75rem", fontSize: "0.85rem" }}>
        开发员电报：{" "}
        <a href={DEV_TELEGRAM_URL} target="_blank" rel="noreferrer">
          {DEV_TELEGRAM_HANDLE}
        </a>
      </p>
    </div>
  );
}
