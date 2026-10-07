"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { RedirectToLogin } from "@/components/shared/RedirectToLogin";
import { Loader2 } from "lucide-react";

type ModuleAccess = {
  moduleName: string;
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canExport: boolean;
};

type AppAccess = {
  appName: string;
  modules: ModuleAccess[];
};

export type User = {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  mustChangePassword: boolean;
  roles: string[];
  apps: AppAccess[];
};

type AccountType = "inventory_manager" | "admin" | "head_cook" | "qa_officer";

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  activeAccount: AccountType;
  isAdmin: boolean;
  isHeadCook: boolean;
  isQaOfficer: boolean;
  switchAccount: (account: AccountType) => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

const SCMS_SESSION_KEY = "scms_session_active";

function getAccountProfile(accountType: string): User {
  if (accountType === "admin") {
    return {
      id: "scms-admin",
      username: "scmsadmin",
      firstName: "System",
      lastName: "Admin",
      email: "admin@r3b2p.com",
      mustChangePassword: false,
      roles: ["Admin"],
      apps: [],
    };
  }
  if (accountType === "head_cook") {
    return {
      id: "scms-headcook",
      username: "headcook",
      firstName: "Head",
      lastName: "Cook",
      email: "headcook@r3b2p.com",
      mustChangePassword: false,
      roles: ["Head Cook"],
      apps: [],
    };
  }
  if (accountType === "qa_officer") {
    return {
      id: "scms-qaofficer",
      username: "ramon",
      firstName: "Ramon",
      lastName: "Dela Cruz",
      email: "qaofficer@r3b2p.com",
      mustChangePassword: false,
      roles: ["QA Officer", "Quality Assurance"],
      apps: [],
    };
  }
  return {
    id: "scms-user",
    username: "scmsuser",
    firstName: "Inventory",
    lastName: "Manager",
    email: "scmsuser@r3b2p.com",
    mustChangePassword: false,
    roles: ["InventoryManager", "Inventory Manager"],
    apps: [],
  };
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [activeAccount, setActiveAccount] = useState<AccountType>("inventory_manager");
  const [isLoading, setIsLoading] = useState(true);

  const applyAccount = (acc: string) => {
    const validAcc: AccountType =
      acc === "admin"
        ? "admin"
        : acc === "head_cook"
        ? "head_cook"
        : acc === "qa_officer"
        ? "qa_officer"
        : "inventory_manager";
    setActiveAccount(validAcc);
    setUser(getAccountProfile(validAcc));
  };

  useEffect(() => {
    const init = () => {
      // Auto-authenticate so direct deployment / standalone access works without external SSO redirect
      sessionStorage.setItem(SCMS_SESSION_KEY, "1");
      const stored = typeof window !== "undefined" ? (localStorage.getItem("activeAccount") as AccountType) || "inventory_manager" : "inventory_manager";
      applyAccount(stored);
      setIsLoading(false);
    };
    init();

    const handleStorageChange = () => {
      const stored = (localStorage.getItem("activeAccount") as AccountType) || "inventory_manager";
      applyAccount(stored);
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const switchAccount = (account: AccountType) => {
    localStorage.setItem("activeAccount", account);
    applyAccount(account);
    window.dispatchEvent(new Event("storage"));
  };

  const logout = async (): Promise<void> => {
    sessionStorage.removeItem(SCMS_SESSION_KEY);
    // When external auth is disabled, resetting account profile instead of redirecting
    applyAccount("inventory_manager");
  };

  if (isLoading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background font-sans text-sm text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-foreground" />
        <span className="font-medium text-xs tracking-wider uppercase">Loading...</span>
      </div>
    );
  }

  // Commented out to prevent deployment redirecting to https://localhost:5001/Account/Login
  // if (!user) {
  //   return <RedirectToLogin />;
  // }

  const isAdmin = user?.roles?.includes("Admin") || activeAccount === "admin";
  const isHeadCook = user?.roles?.includes("Head Cook") || activeAccount === "head_cook" || user?.username === "headcook";
  const isQaOfficer = user?.roles?.includes("QA Officer") || activeAccount === "qa_officer" || user?.username === "ramon";

  return (
    <AuthContext.Provider value={{ user, isLoading, activeAccount, isAdmin, isHeadCook, isQaOfficer, switchAccount, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};