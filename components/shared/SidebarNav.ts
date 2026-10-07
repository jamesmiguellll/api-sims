import {
  LayoutDashboard,
  Warehouse,
  ShoppingCart,
  Boxes,
  Building2,
  Truck,
  Settings,
  Users2,
  CreditCard,
  PackageCheck,
  GitBranch,
  ClipboardList,
  BarChart3,
  Calculator,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  group?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export interface SystemItem {
  fullName: string;
  desc: string;
  icon: LucideIcon;
  active: boolean;
}

export interface AccountItem {
  id: string;
  name: string;
  role: string;
  email: string;
}

export type Account = AccountItem;

export const navGroups: NavGroup[] = [
  {
    label: "Core",
    items: [
      { name: "Dashboard",            href: "/",                    icon: LayoutDashboard },
      { name: "Resources & Suppliers", href: "/resources-suppliers", icon: Warehouse },
      { name: "Orders & Procurement", href: "/orders-procurement",  icon: ShoppingCart },
    ],
  },
  {
    label: "Operations",
    items: [
      { name: "Goods Receiving",      href: "/goods-receiving",     icon: PackageCheck },
      { name: "Inventory",            href: "/inventory",           icon: Boxes },
      { name: "Production & Quality", href: "/production-quality",  icon: Building2 },
      { name: "Stock Transfer",       href: "/distribution",        icon: Truck },
    ],
  },
];

/** Flat list of all nav items for breadcrumb lookups */
export const mainNavItems: NavItem[] = navGroups.flatMap((g) => g.items);

export const settingsNavItem: NavItem = {
  name: "Settings",
  href: "/settings",
  icon: Settings,
};

export const navItems: NavItem[] = [...mainNavItems, settingsNavItem];

export const systems: SystemItem[] = [
  {
    fullName: "Customer Relationship Management",
    desc: "Customer profiles, tickets & marketing",
    icon: Building2,
    active: false,
  },
  {
    fullName: "E-Commerce Storefront",
    desc: "Online orders & products",
    icon: ShoppingCart,
    active: false,
  },
  {
    fullName: "Human Resource Management",
    desc: "Staff directory & payroll",
    icon: Users2,
    active: false,
  },
  {
    fullName: "Point of Sale",
    desc: "Retail & register checkout",
    icon: CreditCard,
    active: false,
  },
  {
    fullName: "Supply Chain Management",
    desc: "Inventory & logistics",
    icon: Truck,
    active: true,
  },
];

export const accounts: AccountItem[] = [
  {
    id: "head_cook",
    name: "Head Cook",
    role: "Head Cook",
    email: "headcook@r3b2p.com",
  },
  {
    id: "inventory_manager",
    name: "Inventory Manager",
    role: "Inventory Manager",
    email: "scmsuser@r3b2p.com",
  },
  {
    id: "qa_officer",
    name: "Ramon Dela Cruz",
    role: "QA Officer",
    email: "qaofficer@r3b2p.com",
  },
  {
    id: "admin",
    name: "Admin Account",
    role: "Admin",
    email: "admin@r3b2p.com",
  },
];

