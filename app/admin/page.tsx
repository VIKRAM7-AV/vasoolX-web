"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Search,
  Filter,
  Check,
  X,
  Calendar,
  Wallet,
  Building2,
  PieChart,
  AlertOctagon,
  LogOut,
} from "lucide-react";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import toast from "react-hot-toast";

// ==========================================
// 1. API & TYPES
// ==========================================
import api from "@/api/api";

interface Payment {
  date: string;
  amount: number;
  status: "paid" | "due";
}

interface User {
  _id: string;
  userId: {
    name: string;
    phone: string | number;
    profile?: string;
  };
  bookingType: "10 weeks" | "50 days" | "100 days";
  amount: number;
  startingDate: string;
  endingDate?: string;
  pendingAmount?: number;
  collectedAmount?: number;
  status?: "active" | "arrear";
  payments: Payment[];
}

interface WealthData {
  adminCurrentAmount: number;
  activePendingSum: number;
  arrearPendingSum: number;
  companyWealth: number;
  adminBalanceAmount: number;
}

// ==========================================
// 2. HELPER FUNCTIONS
// ==========================================
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount || 0);
};

const formatCompactAmount = (amount: number) => {
  if (!amount && amount !== 0) return "0";
  if (amount >= 1000) {
    const k = amount / 1000;
    return `${Number(k.toFixed(2))}K`;
  }
  return `${amount}`;
};

const getDateString = (dateInput: Date | string) => {
  if (!dateInput) return "";
  const d = new Date(dateInput);
  return d.toISOString().split("T")[0];
};

const addDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

// ==========================================
// 3. STATS WIDGET (Compact Version)
// ==========================================
const MiniStat = ({ label, value, icon: Icon, color }: any) => {
  // Use a static mapping so Tailwind can detect the color classes during build
  const colorMap: Record<string, string> = {
    "bg-emerald-500": "text-white",
    "bg-indigo-500": "text-white",
    "bg-rose-500": "text-white",
    "bg-blue-500": "text-white",
  };
  const textColor = colorMap[color] || "text-slate-600";

  return (
    <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-lg p-3 shadow-sm min-w-50">
      <div className={`p-2 rounded-md ${color} bg-opacity-10`}>
        <Icon size={18} className={`${textColor}`} strokeWidth={2} />
      </div>
      <div>
        <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
          {label}
        </p>
        <p className="text-base font-bold text-slate-800">{value}</p>
      </div>
    </div>
  );
};

// ==========================================
// 4. MAIN COMPONENT
// ==========================================
export default function AdminDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<
    "10 weeks" | "50 days" | "100 days"
  >("10 weeks");
  const [search, setSearch] = useState("");
  const [wealth, setWealth] = useState<WealthData | null>(null);
  const [activeUsers, setActiveUsers] = useState<User[]>([]);
  const [arrearUsers, setArrearUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [userFilter, setUserFilter] = useState<"active" | "arrear">("active");
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // --- AUTH CHECK & SESSION GUARD ---
  useEffect(() => {
    const token = Cookies.get("access_token");
    if (!token) {
      router.replace("/");
    }
  }, [router]);

  const handleLogout = () => {
    setShowLogoutModal(false);
    Cookies.remove("access_token");
    Cookies.remove("refresh_token");
    try {
      localStorage.removeItem("admin_data");
    } catch {}
    toast.success("Logged out successfully");
    router.replace("/");
  };

  // Derive the displayed user pool from the filter toggle
  const users = userFilter === "active" ? activeUsers : arrearUsers;

  // --- FETCH DATA ---
  useEffect(() => {
    const token = Cookies.get("access_token");
    if (!token) {
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        const [wealthRes, activeRes, arrearRes] = await Promise.all([
          api.get("/user/wealth-projection"),
          api.get("/user/allvasool"),
          api.get("/user/arrearvasool"),
        ]);
        if (wealthRes.data?.data) setWealth(wealthRes.data.data);
        if (activeRes.data?.data) setActiveUsers(activeRes.data.data);
        if (arrearRes.data?.data) setArrearUsers(arrearRes.data.data);
      } catch (error) {
        console.error("API Error:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // --- FILTER & LOGIC ---
  const filteredUsers = useMemo(() => {
    const searchLower = search.toLowerCase();
    return users
      .filter((user) => {
        const matchesTab = user.bookingType === activeTab;
        const name = user.userId?.name || "";
        const phone = String(user.userId?.phone || "").toLowerCase();
        const matchesSearch =
          name.toLowerCase().includes(searchLower) || phone.includes(searchLower);
        return matchesTab && matchesSearch;
      })
      .sort((a, b) => {
        const dateA = a.startingDate ? new Date(a.startingDate).getTime() : 0;
        const dateB = b.startingDate ? new Date(b.startingDate).getTime() : 0;
        if (dateA !== dateB) return dateA - dateB;
        return (a.userId?.name || "").localeCompare(b.userId?.name || "");
      });
  }, [users, activeTab, search]);

  const tableDates = useMemo(() => {
    if (filteredUsers.length === 0) return [];

    // Find the absolute earliest date among all filtered users to start the calendar
    const earliestStart = filteredUsers.reduce(
      (min, p) => (p.startingDate < min ? p.startingDate : min),
      filteredUsers[0].startingDate,
    );
    const startDate = new Date(earliestStart);

    // For arrear mode: span up to the latest endingDate so all booking periods are visible
    let totalDays: number;
    if (userFilter === "arrear" && filteredUsers.some((u) => u.endingDate)) {
      const latestEnd = filteredUsers.reduce(
        (max, p) => (p.endingDate && p.endingDate > max ? p.endingDate : max),
        filteredUsers[0].endingDate || filteredUsers[0].startingDate,
      );
      const msPerDay = 1000 * 60 * 60 * 24;
      totalDays =
        Math.ceil(
          (new Date(latestEnd).getTime() - startDate.getTime()) / msPerDay,
        ) + 14; // +14 days buffer
    } else {
      totalDays = activeTab === "10 weeks" ? 90 : 60;
    }

    const dates = [];
    for (let i = 0; i < totalDays; i++) {
      const currentDate = addDays(startDate, i);
      if (activeTab === "10 weeks") {
        if (currentDate.getDay() === 6) dates.push(new Date(currentDate)); // Saturdays only
      } else {
        if (currentDate.getDay() !== 0) dates.push(new Date(currentDate)); // Skip Sundays
      }
    }
    return dates;
  }, [filteredUsers, activeTab, userFilter]);

  const totalPending =
    (wealth?.activePendingSum || 0) + (wealth?.arrearPendingSum || 0);

  return (
    <div className="h-screen flex flex-col bg-slate-50 font-sans text-slate-900 overflow-hidden">
      {/* --- HEADER: COMPACT STATS --- */}
      <div className="flex-none bg-white border-b border-slate-200 px-4 py-3 shadow-sm z-20">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <Calendar className="text-white" size={20} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 leading-tight">
                Master Register
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Vasool Tracker v1.0
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex overflow-x-auto gap-3 pb-1 xl:pb-0 custom-scrollbar">
              <MiniStat
                label="Liquid Cash"
                value={formatCurrency(wealth?.adminBalanceAmount || 0)}
                icon={Wallet}
                color="bg-emerald-500"
              />
              <MiniStat
                label="Net Profit"
                value={formatCurrency(wealth?.adminCurrentAmount || 0)}
                icon={PieChart}
                color="bg-indigo-500"
              />
              <MiniStat
                label="Pending Dues"
                value={formatCurrency(totalPending)}
                icon={AlertOctagon}
                color="bg-rose-500"
              />
              <MiniStat
                label="Assets"
                value={formatCurrency(wealth?.companyWealth || 0)}
                icon={Building2}
                color="bg-blue-500"
              />
            </div>

            <button
              onClick={() => setShowLogoutModal(true)}
              title="Logout"
              className="flex items-center gap-1.5 px-3 py-4.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer whitespace-nowrap active:scale-95"
            >
              <LogOut size={24} />
            </button>
          </div>
        </div>
      </div>

      {/* --- MAIN WORKSPACE --- */}
      <div className="flex-1 flex flex-col p-4 overflow-hidden min-h-0">
        {/* TOOLBAR (Attached to Table) */}
        <div className="flex-none bg-white rounded-t-xl border border-b-0 border-slate-300 p-3 flex flex-col md:flex-row justify-between items-center gap-3 shadow-sm z-10">
          {/* Left: Booking-type tabs + Active/Arrear toggle */}
          <div className="flex items-center gap-2 self-start md:self-auto">
            {/* Booking type tabs */}
            <div className="flex bg-slate-100 p-1 rounded-lg">
              {(["10 weeks", "50 days", "100 days"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`
                    px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wide transition-all
                    ${
                      activeTab === tab
                        ? "bg-white text-indigo-700 shadow-sm ring-1 ring-black/5"
                        : "text-slate-500 hover:text-slate-700"
                    }
                  `}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Active / Arrear toggle pill */}
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => setUserFilter("active")}
                className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wide transition-all ${
                  userFilter === "active"
                    ? "bg-emerald-500 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                ✓ Active
              </button>
              <button
                onClick={() => setUserFilter("arrear")}
                className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wide transition-all ${
                  userFilter === "arrear"
                    ? "bg-rose-500 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                ⚠ Arrear
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 w-[50%]">
            <div className="relative flex-1 md:w-64">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={16}
              />
              <input
                type="text"
                placeholder="Search student / customer..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-none text-sm font-medium"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* --- EXCEL TABLE CONTAINER --- */}
        <div className="flex-1 bg-white border border-slate-300 rounded-b-xl overflow-hidden shadow-sm relative flex flex-col min-h-0">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-4"></div>
              <p className="text-sm text-slate-500 font-medium">
                Loading register data...
              </p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
              <Filter size={48} className="mb-2 opacity-20" />
              <p>No records found for {activeTab}</p>
            </div>
          ) : (
            //  SCROLLABLE TABLE AREA
            <div className="flex-1 overflow-auto custom-scrollbar min-h-0">
              <table className="border-collapse min-w-max text-sm">
                {/* HEADERS */}
                <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase sticky top-0 z-40 shadow-sm h-14">
                  <tr>
                    {/* Fixed Columns: Use z-50 to stay on top of everything */}
                    <th className="sticky left-0 top-0 z-50 bg-white border-b border-r border-slate-300 w-12 text-center shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                      #
                    </th>
                    <th className="sticky left-12 top-0 z-50 bg-white border-b border-r border-slate-300 w-56 text-left px-4 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                      Name Details
                    </th>
                    <th className="sticky left-64 top-0 z-50 bg-white border-r border-slate-300 w-28 text-right px-4 shadow-[5px_0_5px_-2px_rgba(0,0,0,0.1)]">
                      Loan Info
                    </th>

                    {/* Date Columns */}
                    {tableDates.map((date, i) => {
                      const isToday =
                        getDateString(date) === getDateString(new Date());
                      return (
                        <th
                          key={i}
                          style={{ width: 30, minWidth: 30 }}
                          className={`border-b border-r border-slate-200 text-center hover:bg-slate-100 transition-colors ${isToday ? "bg-blue-50" : "bg-slate-50"}`}
                        >
                          <div className="flex flex-col items-center justify-center h-full">
                            <span className="text-[9px] leading-tight text-slate-400">
                              {date.toLocaleString("default", {
                                month: "short",
                              })}
                            </span>
                            <span
                              className={`text-sm font-bold leading-tight ${isToday ? "text-blue-600" : "text-slate-700"}`}
                            >
                              {date.getDate()}
                            </span>
                            {/* <span className="text-[9px] leading-tight text-slate-400">{date.toLocaleString('default', { weekday: 'short' }).charAt(0)}</span> */}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                {/* BODY */}
                <tbody className="divide-y divide-slate-200 text-slate-700">
                  {filteredUsers.map((user, idx) => {
                    // Calc Installment
                    const divisor =
                      user.bookingType === "10 weeks"
                        ? 10
                        : user.bookingType === "50 days"
                          ? 50
                          : 100;
                    const installment = Math.round(user.amount / divisor);
                    const userStartStr = getDateString(user.startingDate);

                    return (
                      <tr
                        key={user._id}
                        className="group hover:bg-blue-50/30 transition-colors h-12"
                      >
                        {/* 1. S.NO (Fixed) */}
                        <td className="sticky left-0 z-30 bg-white  border-r border-slate-200 text-center text-slate-400 font-mono text-xs shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                          {idx + 1}
                        </td>

                        {/* 2. NAME (Fixed) */}
                        <td className="sticky left-12 z-30 bg-white  border-r border-slate-200 px-4 py-2 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-sm
                               ${idx % 4 === 0 ? "bg-blue-500" : idx % 4 === 1 ? "bg-emerald-500" : idx % 4 === 2 ? "bg-amber-500" : "bg-rose-500"}
                             `}
                            >
                              {user.userId?.name?.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-800 text-xs truncate w-32">
                                {user.userId?.name}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {user.userId?.phone}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* 3. LOAN (Fixed) */}
                        <td className="sticky left-64 z-30 bg-white border-r border-slate-300 px-4 text-right shadow-[5px_0_5px_-2px_rgba(0,0,0,0.1)]">
                          {userFilter === "arrear" ? (
                            <>
                              <div className="font-bold text-rose-600 text-xs">
                                {formatCurrency(user.pendingAmount || 0)}
                              </div>
                              <div className="text-[9px] text-slate-500">Pending</div>
                            </>
                          ) : (
                            <>
                              <div className="font-bold text-slate-800 text-xs">
                                {formatCurrency(user.amount * 0.8)}
                              </div>
                              <div className="text-[9px] text-slate-500">
                                Due: {installment}
                              </div>
                            </>
                          )}
                        </td>

                        {/* 4. DATE CELLS */}
                        {tableDates.map((colDate, i) => {
                          const colDateStr = getDateString(colDate);
                          const todayStr = getDateString(new Date());

                          // Black box for dates before this user started
                          if (colDateStr < userStartStr) {
                            return (
                              <td
                                key={i}
                                className="border-r border-slate-200 bg-slate-900 text-center p-0 align-middle"
                              >
                                <span className="text-slate-500 font-bold">-</span>
                              </td>
                            );
                          }

                          // ── ARREAR MODE: show actual paid amounts ──────────────────
                          if (userFilter === "arrear") {
                            const endingDateStr = user.endingDate
                              ? getDateString(user.endingDate)
                              : "";
                            const payment = user.payments?.find(
                              (p) => getDateString(p.date) === colDateStr,
                            );

                            if (payment) {
                              // Paid: show compact real amount (e.g. "1.5K", "2K", "500")
                              const compactAmt = formatCompactAmount(payment.amount);
                              return (
                                <td
                                  key={i}
                                  className="border-r border-emerald-200 bg-emerald-50 text-center p-0 align-middle"
                                >
                                  <div className="flex items-center justify-center h-full">
                                    <span className="text-[8px] font-bold text-emerald-700 leading-none">
                                      {compactAmt}
                                    </span>
                                  </div>
                                </td>
                              );
                            }

                            // After booking ended → empty (no longer applicable)
                            if (endingDateStr && colDateStr > endingDateStr) {
                              return (
                                <td key={i} className="border-r border-slate-200 p-0 text-center">
                                  <div className="flex items-center justify-center h-full">
                                    <div className="w-1 h-1 rounded-full bg-slate-200"></div>
                                  </div>
                                </td>
                              );
                            }

                            // Unpaid slot within booking period → arrear/due
                            return (
                              <td
                                key={i}
                                className="border-r border-rose-100 bg-rose-50/40 p-0 text-center"
                              >
                                <div className="flex items-center justify-center h-full">
                                  <X size={14} strokeWidth={3} className="text-rose-400" />
                                </div>
                              </td>
                            );
                          }

                          // ── ACTIVE MODE: existing status logic ────────────────────
                          const payment = user.payments?.find(
                            (p) => getDateString(p.date) === colDateStr,
                          );
                          let status = "none";
                          if (payment) status = payment.status;
                          else if (colDateStr <= todayStr) status = "pending";

                          return (
                            <td
                              key={i}
                              className="border-r border-slate-200 p-0 text-center relative hover:bg-white transition-colors cursor-pointer"
                            >
                              <div className="w-full h-full flex items-center justify-center">
                                {/* PAID - Green Tick */}
                                {status === "paid" && (
                                  <div className="text-emerald-600">
                                    <Check size={18} strokeWidth={4} />
                                  </div>
                                )}

                                {/* DUE - Red X */}
                                {status === "due" && (
                                  <div className="text-rose-500 opacity-80">
                                    <X size={18} strokeWidth={4} />
                                  </div>
                                )}

                                {/* PENDING - Yellow Dot */}
                                {status === "pending" && (
                                  <div className="w-3 h-3 rounded-full bg-amber-400 border-2 border-amber-200"></div>
                                )}

                                {/* FUTURE/NONE - Empty Dot */}
                                {status === "none" && (
                                  <div className="w-1 h-1 rounded-full bg-slate-300"></div>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* TABLE FOOTER SUMMARY */}
          <div className="bg-slate-50 border-t border-slate-300 p-2 text-xs text-slate-500 flex justify-between items-center z-20">
            <span>
              Showing {filteredUsers.length}{" "}
              <span className={userFilter === "active" ? "text-emerald-600 font-semibold" : "text-rose-500 font-semibold"}>
                {userFilter === "active" ? "active" : "arrear"}
              </span>{" "}
              records
            </span>
            <div className="flex gap-4">
              <span className="flex items-center gap-1">
                <Check size={12} className="text-emerald-600" /> Paid
              </span>
              <span className="flex items-center gap-1">
                <X size={12} className="text-rose-500" /> Unpaid
              </span>
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-amber-400"></div>{" "}
                Pending
              </span>
              <span className="flex items-center gap-1">
                <div className="w-4 h-4 bg-slate-900 flex items-center justify-center text-slate-500 text-[9px] rounded-sm">
                  -
                </div>{" "}
                Not Started
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* --- LOGOUT CONFIRMATION MODAL --- */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 flex flex-col items-center text-center animate-in zoom-in-95 duration-150">
            <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mb-4 border border-rose-100 shadow-sm">
              <LogOut size={26} strokeWidth={2.5} />
            </div>

            <h3 className="text-xl font-bold text-slate-900 mb-2">
              Confirm Logout
            </h3>
            <p className="text-sm text-slate-500 mb-6 leading-relaxed">
              Are you sure you want to sign out from the Admin Portal? You will need to sign in again to access the dashboard.
            </p>

            <div className="flex items-center gap-3 w-full">
              <button
                type="button"
                onClick={() => setShowLogoutModal(false)}
                className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="flex-1 py-3 px-4 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-semibold text-sm rounded-xl transition-all shadow-md hover:shadow-rose-600/20 cursor-pointer"
              >
                Yes, Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f5f9;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>
    </div>
  );
}
