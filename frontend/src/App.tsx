import { Link, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, getToken, setToken, type User } from "./api";
import PublicHomePage from "./pages/PublicHomePage";
import PublicOpenLanding from "./pages/PublicOpenLanding";
import OpenPage from "./pages/OpenPage";
import LoginPage from "./pages/LoginPage";
import MemberRegisterPage from "./pages/MemberRegisterPage";
import StaffOnMemberPage from "./pages/StaffOnMemberPage";
import BranchPresetsPage from "./pages/BranchPresetsPage";
import BranchNetworkPage from "./pages/BranchNetworkPage";
import BranchDecorPage from "./pages/BranchDecorPage";
import BranchScenariosPage from "./pages/BranchScenariosPage";
import BranchOpenWalletsPage from "./pages/BranchOpenWalletsPage";
import BranchWalletsPage from "./pages/BranchWalletsPage";
import BranchUpdatePage from "./pages/BranchUpdatePage";
import BranchSubscriptionPage from "./pages/BranchSubscriptionPage";
import BranchMembersPage from "./pages/BranchMembersPage";
import BranchHelpPage from "./pages/BranchHelpPage";
import MemberBuyRegisterPage from "./pages/MemberBuyRegisterPage";
import MemberSubscriptionPage from "./pages/MemberSubscriptionPage";
import ChangePasswordPage from "./pages/ChangePasswordPage";
import LanguageSwitcher from "./components/LanguageSwitcher";
import LicenseBanner from "./components/LicenseBanner";
import { DEV_TELEGRAM_HANDLE, DEV_TELEGRAM_URL } from "./devContact";

function homePath(user: User) {
  return user.role === "MEMBER" ? "/member/scenarios" : "/branch/presets";
}

function BranchShell({
  user,
  onLogout,
}: {
  user: User;
  onLogout: (nextPath?: string) => void;
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
        <Link to="/branch/scenarios">{t("nav.scenarios")}</Link>
        {user.role === "SUPER_ADMIN" && (
          <Link to="/branch/members">{t("nav.members")}</Link>
        )}
        <Link to="/branch/open-wallets">{t("nav.openWallets")}</Link>
        <Link to="/branch/subscription">{t("nav.subscription")}</Link>
        <Link to="/branch/update">{t("nav.update")}</Link>
        <Link to="/branch/help">{t("nav.help")}</Link>
        <Link to="/branch/password">{t("nav.password")}</Link>
        <a href="/" target="_blank" rel="noreferrer">
          {t("nav.publicPage")}
        </a>
        <a href="/open" target="_blank" rel="noreferrer">
          {t("nav.openPage")}
        </a>
        <a href={DEV_TELEGRAM_URL} target="_blank" rel="noreferrer">
          {t("nav.developer", { handle: DEV_TELEGRAM_HANDLE })}
        </a>
        <LanguageSwitcher />
        <span className="muted">{user.displayName || user.username}</span>
        <button className="btn ghost" type="button" onClick={() => onLogout()}>
          {t("nav.logout")}
        </button>
      </nav>
      <LicenseBanner buyHref="/branch/subscription" />
      <Outlet />
    </div>
  );
}

function MemberShell({
  user,
  onLogout,
}: {
  user: User;
  onLogout: (nextPath?: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="layout">
      <nav className="nav">
        <div className="brand">{t("brand")}</div>
        <Link to="/member/scenarios">{t("nav.scenarios")}</Link>
        <Link to="/member/presets">{t("nav.presets")}</Link>
        <Link to="/member/subscription">{t("nav.memberSubscription")}</Link>
        <Link to="/member/help">{t("nav.help")}</Link>
        <Link to="/member/password">{t("nav.password")}</Link>
        {user.memberEntryUrl && (
          <a href={user.memberEntryUrl} target="_blank" rel="noreferrer">
            {t("member.myEntry")}
          </a>
        )}
        <LanguageSwitcher />
        <span className="muted">{user.displayName || user.username}</span>
        <button className="btn ghost" type="button" onClick={() => onLogout()}>
          {t("nav.logout")}
        </button>
      </nav>
      <LicenseBanner />
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

  function handleLogout(nextPath = "/") {
    setToken(null);
    setUser(null);
    window.location.assign(nextPath);
  }

  return (
    <Routes>
      <Route path="/" element={<PublicHomePage />} />
      <Route path="/open" element={<PublicOpenLanding />} />
      <Route path="/m" element={<PublicOpenLanding />} />
      <Route path="/p/u/:code" element={<PublicOpenLanding />} />
      <Route path="/p/:slug" element={<PublicOpenLanding />} />
      <Route path="/o/:token" element={<OpenPage />} />

      <Route
        path="/login"
        element={
          user ? (
            <Navigate to={homePath(user)} replace />
          ) : (
            <LoginPage onLogin={handleLogin} />
          )
        }
      />
      <Route
        path="/member/login"
        element={
          user?.role === "MEMBER" ? (
            <Navigate to="/member/scenarios" replace />
          ) : user ? (
            <StaffOnMemberPage nextPath="/login" onLogout={handleLogout} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/member/register"
        element={
          user?.role === "MEMBER" ? (
            <Navigate to="/member/scenarios" replace />
          ) : user ? (
            <StaffOnMemberPage nextPath="/member/register" onLogout={handleLogout} />
          ) : (
            <MemberRegisterPage onLogin={handleLogin} />
          )
        }
      />
      <Route path="/member/buy-register" element={<MemberBuyRegisterPage />} />
      <Route
        path="/member"
        element={
          !user ? (
            <Navigate to="/login" replace />
          ) : user.role !== "MEMBER" ? (
            <Navigate to="/branch/presets" replace />
          ) : (
            <MemberShell user={user} onLogout={handleLogout} />
          )
        }
      >
        <Route index element={<Navigate to="/member/scenarios" replace />} />
        <Route path="scenarios" element={<BranchScenariosPage user={user!} />} />
        <Route path="presets" element={<BranchPresetsPage user={user!} />} />
        <Route
          path="subscription"
          element={
            <MemberSubscriptionPage
              user={user!}
              onUserUpdate={(u) => setUser(u)}
            />
          }
        />
        <Route path="help" element={<BranchHelpPage />} />
        <Route
          path="password"
          element={
            <ChangePasswordPage
              user={user!}
              helpHref="/member/help#help-password"
              onUserUpdate={(u) => setUser(u)}
            />
          }
        />
      </Route>

      <Route
        path="/branch/login"
        element={
          user ? (
            <Navigate to={homePath(user)} replace />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/branch"
        element={
          !user ? (
            <Navigate to="/login" replace />
          ) : user.role === "MEMBER" ? (
            <Navigate to="/member/scenarios" replace />
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
        <Route path="scenarios" element={<BranchScenariosPage user={user!} />} />
        <Route
          path="members"
          element={
            user?.role === "SUPER_ADMIN" ? (
              <BranchMembersPage user={user} />
            ) : (
              <Navigate to="/branch/presets" replace />
            )
          }
        />
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
        <Route path="subscription" element={<BranchSubscriptionPage user={user!} />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
