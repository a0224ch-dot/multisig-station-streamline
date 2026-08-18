import { Link, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, getToken, setToken, type User } from "./api";
import PublicHomePage from "./pages/PublicHomePage";
import OpenPage from "./pages/OpenPage";
import BranchLoginPage from "./pages/BranchLoginPage";
import BranchPresetsPage from "./pages/BranchPresetsPage";
import BranchNetworkPage from "./pages/BranchNetworkPage";
import BranchDecorPage from "./pages/BranchDecorPage";
import BranchOpenWalletsPage from "./pages/BranchOpenWalletsPage";
import BranchWalletsPage from "./pages/BranchWalletsPage";
import BranchUpdatePage from "./pages/BranchUpdatePage";
import BranchHelpPage from "./pages/BranchHelpPage";
import ChangePasswordPage from "./pages/ChangePasswordPage";
import LanguageSwitcher from "./components/LanguageSwitcher";
import { DEV_TELEGRAM_HANDLE, DEV_TELEGRAM_URL } from "./devContact";

function BranchShell({
  user,
  onLogout,
}: {
  user: User;
  onLogout: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="layout">
      <nav className="nav">
        <div className="brand">{t("brand")}</div>
        <Link to="/branch/presets">{t("nav.presets")}</Link>
        {user.role === "SUPER_ADMIN" && <Link to="/branch/network">{t("nav.network")}</Link>}
        <Link to="/branch/wallets">{t("nav.wallets")}</Link>
        <Link to="/branch/decor">{t("nav.decor")}</Link>
        <Link to="/branch/open-wallets">{t("nav.openWallets")}</Link>
        <Link to="/branch/update">{t("nav.update")}</Link>
        <Link to="/branch/help">{t("nav.help")}</Link>
        <Link to="/branch/password">{t("nav.password")}</Link>
        <a href="/" target="_blank" rel="noreferrer">
          {t("nav.publicPage")}
        </a>
        <a href={DEV_TELEGRAM_URL} target="_blank" rel="noreferrer">
          {t("nav.developer", { handle: DEV_TELEGRAM_HANDLE })}
        </a>
        <LanguageSwitcher />
        <span className="muted">{user.displayName || user.username}</span>
        <button className="btn ghost" type="button" onClick={onLogout}>
          {t("nav.logout")}
        </button>
      </nav>
      <Outlet />
    </div>
  );
}

export default function App() {
  const { t } = useTranslation();
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

  if (loading) return <div className="layout muted">{t("common.loading")}</div>;

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
        <Route path="network" element={<BranchNetworkPage user={user!} />} />
        <Route path="wallets" element={<BranchWalletsPage />} />
        <Route path="decor" element={<BranchDecorPage user={user!} />} />
        <Route path="open-wallets" element={<BranchOpenWalletsPage user={user!} />} />
        <Route path="help" element={<BranchHelpPage />} />
        <Route
          path="password"
          element={
            <ChangePasswordPage
              user={user!}
              helpHref="/branch/help#help-password"
              onUserUpdate={(u) => setUser(u)}
            />
          }
        />
        <Route path="update" element={<BranchUpdatePage user={user!} />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
