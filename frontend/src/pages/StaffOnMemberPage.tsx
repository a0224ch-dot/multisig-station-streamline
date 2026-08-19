import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "../components/LanguageSwitcher";

/** 管理员已登录时访问会员登录/注册：提示先退出，避免顶掉管理会话 */
export default function StaffOnMemberPage({
  nextPath,
  onLogout,
}: {
  nextPath: "/login" | "/member/register";
  onLogout: (nextPath: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="login-wrap">
      <div style={{ position: "absolute", top: "1rem", right: "1rem" }}>
        <LanguageSwitcher />
      </div>
      <div className="card login-card">
        <h1>{t("member.staffLoggedInTitle")}</h1>
        <p className="muted">{t("member.staffLoggedInHint")}</p>
        <button className="btn" type="button" onClick={() => onLogout(nextPath)}>
          {t("member.staffLogoutToContinue")}
        </button>
        <p className="muted" style={{ marginTop: "1rem", marginBottom: 0 }}>
          <Link to="/">{t("member.backHome")}</Link>
        </p>
      </div>
    </div>
  );
}
