import { Link, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import { api, getToken, setToken, type User } from "./api";
import PublicHomePage from "./pages/PublicHomePage";
import OpenPage from "./pages/OpenPage";
import BranchLoginPage from "./pages/BranchLoginPage";
import BranchPresetsPage from "./pages/BranchPresetsPage";
import BranchDecorPage from "./pages/BranchDecorPage";
import BranchOpenWalletsPage from "./pages/BranchOpenWalletsPage";
import BranchWalletsPage from "./pages/BranchWalletsPage";
import BranchUpdatePage from "./pages/BranchUpdatePage";
import BranchHelpPage from "./pages/BranchHelpPage";
import ChangePasswordPage from "./pages/ChangePasswordPage";
import { DEV_TELEGRAM_HANDLE, DEV_TELEGRAM_URL } from "./devContact";

function BranchShell({
  user,
  onLogout,
}: {
  user: User;
  onLogout: () => void;
}) {
  return (
    <div className="layout">
      <nav className="nav">
        <div className="brand">精简多签</div>
        <Link to="/branch/presets">多签地址</Link>
        <Link to="/branch/wallets">已开通</Link>
        <Link to="/branch/decor">公网页装修</Link>
        <Link to="/branch/open-wallets">开通钱包</Link>
        <Link to="/branch/update">系统更新</Link>
        <Link to="/branch/help">使用说明</Link>
        <Link to="/branch/password">修改密码</Link>
        <a href="/" target="_blank" rel="noreferrer">
          公网页
        </a>
        <a href={DEV_TELEGRAM_URL} target="_blank" rel="noreferrer">
          开发员 {DEV_TELEGRAM_HANDLE}
        </a>
        <span className="muted">{user.displayName || user.username}</span>
        <button className="btn ghost" type="button" onClick={onLogout}>
          退出
        </button>
      </nav>
      <Outlet />
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!getToken());

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="layout muted">加载中…</div>;

  function handleLogin(token: string, u: User) {
    setToken(token);
    setUser(u);
  }

  function handleLogout() {
    setToken(null);
    setUser(null);
  }

  return (
    <Routes>
      <Route path="/" element={<PublicHomePage />} />
      <Route path="/m" element={<PublicHomePage />} />
      <Route path="/o/:token" element={<OpenPage />} />

      <Route
        path="/branch/login"
        element={
          user ? (
            <Navigate to="/branch/presets" replace />
          ) : (
            <BranchLoginPage onLogin={handleLogin} />
          )
        }
      />
      <Route
        path="/branch"
        element={
          !user ? (
            <Navigate to="/branch/login" replace />
          ) : (
            <BranchShell user={user} onLogout={handleLogout} />
          )
        }
      >
        <Route index element={<Navigate to="/branch/presets" replace />} />
        <Route path="presets" element={<BranchPresetsPage user={user!} />} />
        <Route path="wallets" element={<BranchWalletsPage />} />
        <Route path="decor" element={<BranchDecorPage user={user!} />} />
        <Route path="open-wallets" element={<BranchOpenWalletsPage user={user!} />} />
        <Route path="help" element={<BranchHelpPage />} />
        <Route
          path="password"
          element={<ChangePasswordPage user={user!} helpHref="/branch/help#help-password" />}
        />
        <Route path="update" element={<BranchUpdatePage user={user!} />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
