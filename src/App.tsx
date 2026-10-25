import React from 'react';
import { 
  Handshake, 
  ScrollText, 
  FolderEdit, 
  Wallet, 
  User, 
  Gem, 
  Scale, 
  Headphones 
} from 'lucide-react';

const menuItems = [
  { title: '🤝 ثبت معامله جدید', icon: Handshake },
  { title: '📜 لیست معاملات من', icon: ScrollText },
  { title: '📁 پیش‌نویس‌های من', icon: FolderEdit },
  { title: '💳 کیف پول و اعتبار', icon: Wallet },
  { title: '👤 پروفایل کاربری', icon: User },
  { title: '💎 پنل سفیران', icon: Gem },
  { title: '⚖️ داوری و حل اختلاف', icon: Scale },
  { title: '🎧 پشتیبانی', icon: Headphones },
];

const App = () => {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4">
      <header className="mb-6 mt-2 text-center">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">سامانه هوشمند میانجی</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">واسطه‌گری امن و قراردادهای دیجیتال</p>
      </header>
      
      <div className="grid grid-cols-2 gap-3">
        {menuItems.map((item, index) => (
          <button
            key={index}
            className="flex flex-col items-center justify-center p-4 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <item.icon className="w-8 h-8 mb-2 text-blue-600 dark:text-blue-400" />
            <span className="text-xs font-medium text-slate-700 dark:text-slate-200">{item.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default App;
