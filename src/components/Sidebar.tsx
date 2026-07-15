import React from 'react';
import { 
  LayoutDashboard, 
  Users, 
  History, 
  Utensils, 
  BarChart3, 
  Settings, 
  LogOut,
  Boxes,
  Wallet,
  HeartHandshake
} from 'lucide-react';
import type { User } from '../types';
import logo from '../assets/logo.jpg';

interface SidebarProps {
  currentTab: string;
  setTab: (tab: string) => void;
  currentUser: User;
  onLogout: () => void;
  activeTimersCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  setTab,
  currentUser,
  onLogout,
  activeTimersCount
}) => {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'manager', 'staff'] },
    { id: 'active', label: 'Active Seating', icon: Users, roles: ['admin', 'manager', 'staff'], badge: activeTimersCount },
    { id: 'crm', label: 'CRM Subsystem', icon: HeartHandshake, roles: ['admin', 'manager', 'staff'] },
    { id: 'history', label: 'Billing History', icon: History, roles: ['admin', 'manager', 'staff'] },
    { id: 'menu', label: 'Menu Catalog', icon: Utensils, roles: ['admin', 'manager'] },
    { id: 'inventory', label: 'Inventory Stock', icon: Boxes, roles: ['admin'] },
    { id: 'expenses', label: 'Daily Expenses', icon: Wallet, roles: ['admin', 'manager'] },
    { id: 'reports', label: 'Sales Reports', icon: BarChart3, roles: ['admin'] },
    { id: 'settings', label: 'System Settings', icon: Settings, roles: ['admin'] },
  ];

  const filteredItems = menuItems.filter(item => item.roles.includes(currentUser.role));

  return (
    <aside className="lg:w-64 w-20 bg-[#f5f5f7] border-r border-apple-gray-100 flex flex-col justify-between h-screen fixed top-0 left-0 z-20 select-none transition-all duration-300">
      {/* Brand Header */}
      <div className="lg:p-6 p-4">
        <div className="flex items-center gap-3 justify-center lg:justify-start">
          <div className="w-10 h-10 rounded-xl bg-white border border-apple-gray-100 flex items-center justify-center shadow-sm overflow-hidden shrink-0">
            <img src={logo} alt="Chapter One Cafe Logo" className="w-full h-full object-cover" />
          </div>
          <div className="hidden lg:block overflow-hidden">
            <h1 className="text-sm font-semibold text-apple-gray-800 tracking-tight truncate">Chapter One</h1>
            <p className="text-[10px] text-apple-gray-300 font-medium tracking-wide uppercase truncate">Smart Pos System</p>
          </div>
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 lg:px-4 px-2 py-2 space-y-1">
        {filteredItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`w-full flex items-center lg:justify-between justify-center lg:px-4 px-3 py-3 rounded-xl text-sm font-medium transition-apple cursor-pointer ${
                isActive
                  ? 'bg-white text-apple-gray-800 border border-apple-gray-100 shadow-sm'
                  : 'text-[#86868b] hover:text-apple-gray-800 hover:bg-[#e8e8ed]/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-apple-gray-800' : 'text-[#86868b]'}`} />
                <span className="hidden lg:inline">{item.label}</span>
              </div>
              
              {/* Badge for Active Customers */}
              {item.badge !== undefined && item.badge > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-apple-gray-800 text-white animate-pulse-soft hidden lg:inline">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* User Section at the bottom */}
      <div className="lg:p-4 p-2 border-t border-[#e8e8ed] bg-[#f5f5f7]">
        <div className="bg-white rounded-2xl border border-apple-gray-100 lg:p-4 p-2 shadow-sm flex flex-col gap-3 items-center lg:items-stretch">
          <div className="flex items-center gap-3 justify-center lg:justify-start w-full">
            <div className="w-10 h-10 rounded-full bg-apple-gray-50 border border-apple-gray-100 flex items-center justify-center font-bold text-apple-gray-800 text-sm shrink-0">
              {currentUser.username[0]}
            </div>
            <div className="overflow-hidden hidden lg:block">
              <h2 className="text-xs font-semibold text-apple-gray-800 truncate">{currentUser.username}</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-apple-gray-50 text-apple-gray-300 font-semibold uppercase tracking-wider border border-apple-gray-100">
                {currentUser.role}
              </span>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 py-2 lg:px-3 px-1 rounded-xl border border-apple-gray-100 text-xs text-red-500 font-medium hover:bg-red-50 hover:border-red-100 transition-apple cursor-pointer"
            title="Lock Console"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden lg:inline">Lock Console</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
