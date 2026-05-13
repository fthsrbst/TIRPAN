import { Navigate, useLocation } from "react-router-dom";
import { ROLE_HIERARCHY } from "@/lib/utils";
import { isDemoMode } from "@/lib/demoMode";

function getToken(): string | null {
  try {
    return localStorage.getItem("tirpan_token") || sessionStorage.getItem("tirpan_token");
  } catch {
    return null;
  }
}

function getUser(): { role: string } | null {
  try {
    const raw = localStorage.getItem("tirpan_user") || sessionStorage.getItem("tirpan_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

interface Props {
  children: React.ReactNode;
  /** Minimum required role. Defaults to any authenticated user. */
  minRole?: string;
  /** Exact required roles. If provided, minRole is ignored. */
  roles?: string[];
}

export default function ProtectedRoute({ children, minRole, roles }: Props) {
  const token = getToken();
  const location = useLocation();

  if (!token && !isDemoMode()) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Role guard
  if (minRole || roles) {
    const user = getUser();
    const userLevel = ROLE_HIERARCHY[user?.role ?? ""] ?? 0;

    if (roles && user && !roles.includes(user.role)) {
      return <Navigate to="/" replace />;
    }
    if (minRole && userLevel < (ROLE_HIERARCHY[minRole] ?? 0)) {
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
}
