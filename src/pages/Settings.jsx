import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Settings as SettingsIcon, Bot, Zap, Clock, Shield, Mail, Database, MessageSquare, Ticket, FlaskConical } from 'lucide-react';
import MarketingSettingsTab from '@/components/marketing/MarketingSettingsTab';
import SystemSettingsTab from '@/components/settings/SystemSettingsTab';
import CommunicationsTab from '@/components/settings/CommunicationsTab';
import CouponsSettingsTab from '@/components/settings/CouponsSettingsTab';
import ResetTestUserCard from '@/components/settings/ResetTestUserCard';
import BotChat from '@/pages/BotChat';

export default function Settings() {
  const [activeTab, setActiveTab] = useState('general');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">הגדרות</h1>
        <p className="text-muted-foreground text-sm mt-0.5">הגדרות מערכת — גישת Admin בלבד</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-2">
        <button
          onClick={() => setActiveTab('general')}
          className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
            activeTab === 'general' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          <SettingsIcon size={14} className="inline ml-1" />
          כללי
        </button>
        <button
          onClick={() => setActiveTab('system')}
          className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
            activeTab === 'system' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          <Database size={14} className="inline ml-1" />
          הגדרות מערכת
        </button>
        <button
          onClick={() => setActiveTab('communications')}
          className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
            activeTab === 'communications' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          <MessageSquare size={14} className="inline ml-1" />
          לוג תקשורת
        </button>
        <button
          onClick={() => setActiveTab('marketing')}
          className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
            activeTab === 'marketing' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          <Mail size={14} className="inline ml-1" />
          מרכז דיוור
        </button>
        <button
          onClick={() => setActiveTab('coupons')}
          className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
            activeTab === 'coupons' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          <Ticket size={14} className="inline ml-1" />
          קופונים
        </button>
        <button
          onClick={() => setActiveTab('testing')}
          className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
            activeTab === 'testing' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          <FlaskConical size={14} className="inline ml-1" />
          כלי בדיקה
        </button>
        <button
          onClick={() => setActiveTab('bot-chat')}
          className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
            activeTab === 'bot-chat' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          <Bot size={14} className="inline ml-1" />
          בדיקת בוט
        </button>
      </div>

      {activeTab === 'marketing' && <MarketingSettingsTab />}

      {activeTab === 'system' && <SystemSettingsTab />}

      {activeTab === 'communications' && <CommunicationsTab />}

      {activeTab === 'coupons' && <CouponsSettingsTab />}

      {activeTab === 'testing' && (
        <div className="space-y-4">
          <ResetTestUserCard />
        </div>
      )}

      {activeTab === 'bot-chat' && <BotChat />}

      {activeTab === 'general' && <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot size={18} className="text-primary" />
              הגדרות AI Agent (בוט)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <InfoItem label="מנוע" value="Base44 AI Agent" />
            <InfoItem label="שפה" value="עברית בלבד" />
            <InfoItem label="Loop Guard" value="max_messages_per_flow = 5" />
            <InfoItem label="Fallbacks" value="מקסימום 2 לפני Escalation לנציגה" />
            <InfoItem label="שעות פעילות" value="להגדרה ב-Agent Settings" />
            <div className="mt-3 p-3 bg-gold/10 rounded-lg text-xs text-gold">
              ⚠️ לשינוי הגדרות הבוט: Settings → AI Agents → הגדר Loop Guard ו-Fallback Rules
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap size={18} className="text-gold" />
              אוטומציות פעילות
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {[
              { id: 'A', name: 'מענה לליד חדש', status: 'פעיל' },
              { id: 'B', name: 'עדכון Cal.com webhook', status: 'פעיל' },
              { id: 'C', name: 'תזכורות פגישה D-1 + H-1', status: 'פעיל' },
              { id: 'D', name: 'שאלון שורנס מולא', status: 'פעיל' },
              { id: 'E', name: 'פולו-אפ T+7/T+14/T+21', status: 'פעיל' },
              { id: 'F', name: 'חוסר מענה + SLA', status: 'פעיל' },
              { id: 'G', name: 'ייבוא אקסל', status: 'פעיל' },
              { id: 'H', name: 'ברכת יום הולדת', status: 'פעיל' },
              { id: 'I', name: 'תזכורת שנתית', status: 'פעיל' },
              { id: 'L', name: 'Global Error Handler', status: 'פעיל' },
            ].map(a => (
              <div key={a.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                <span><strong className="text-primary mr-1">{a.id}.</strong> {a.name}</span>
                <span className="text-xs text-success font-medium">{a.status}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock size={18} className="text-coral" />
              זמני SLA
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <InfoItem label="ממתין מענה (חדש)" value="2 שעות" />
            <InfoItem label="פולו-אפ ב׳ ללא מענה" value="24 שעות" />
            <InfoItem label="no_response חוזר" value="48 שעות" />
            <InfoItem label="הסלמה לבשמת" value="72 שעות" />
            <div className="mt-2 p-3 bg-muted rounded-lg text-xs text-muted-foreground">
              זמנים לקביעה סופית עם בשמת לפני הפעלת המערכת
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield size={18} className="text-primary" />
              הרשאות (RBAC)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="p-3 bg-primary/5 rounded-lg">
              <div className="font-semibold text-primary mb-1">Admin — בשמת</div>
              <div className="text-xs text-muted-foreground">גישה לכל הרשומות, מחיקות, ייצוא, הגדרות אוטומציה, שגיאות מערכת</div>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <div className="font-semibold mb-1">Staff — יעל, בר</div>
              <div className="text-xs text-muted-foreground">רק רשומות שהוקצו להן (assigned_to = currentUser)</div>
            </div>
          </CardContent>
        </Card>
      </div>}
    </div>
  );
}

function InfoItem({ label, value }) {
  return (
    <div className="flex justify-between items-center py-1 border-b border-border/50 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-left" dir="ltr">{value}</span>
    </div>
  );
}