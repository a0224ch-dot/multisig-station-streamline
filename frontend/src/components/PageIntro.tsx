import type { ReactNode } from "react";

/** 功能页顶部短说明：这页干什么、注意什么 */
export default function PageIntro({ children }: { children: ReactNode }) {
  return <div className="page-intro">{children}</div>;
}
